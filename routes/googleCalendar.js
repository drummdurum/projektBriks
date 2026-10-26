const express = require('express');
const { timingSafeEqual, randomBytes } = require('crypto');
const { listGoogleCalendarEvents, syncGoogleCalendar } = require('../utils/googleCalendar');
const { saveRefreshToken } = require('../utils/calendarToken');
const { prisma } = require('../database/prisma');
const { normalizeDanishPhone, phoneFromFirstLine } = require('../utils/customerPhone');

const router = express.Router();
let pendingSync = null;

function sameSecret(received, expected) {
  if (typeof received !== 'string' || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) return res.sendStatus(401);
  next();
}

router.get('/google/bookings', requireAdmin, async (req, res) => {
  if (!process.env.GOOGLE_CALENDAR_ID) return res.json({ connected: false, bookings: [] });
  try {
    const now = new Date();
    const until = new Date(now);
    until.setUTCFullYear(until.getUTCFullYear() + 1);
    const events = await listGoogleCalendarEvents(new Date(now.getTime() - 30 * 86400000), until);
    const phones = new Set(events.map(event => phoneFromFirstLine(event.description)).filter(Boolean));
    let customersByPhone = new Map();
    if (phones.size) {
      try {
        const customers = await prisma.user.findMany({
          select: { id: true, navn: true, efternavn: true, telefon: true, email: true }
        });
        customersByPhone = customers.reduce((map, customer) => {
          const phone = normalizeDanishPhone(customer.telefon);
          if (phone && phones.has(phone)) map.set(phone, [...(map.get(phone) || []), customer]);
          return map;
        }, new Map());
      } catch (error) {
        console.error('Could not match Google Calendar customers:', error);
      }
    }
    res.json({ connected: true, bookings: events.map(event => ({
      id: event.id,
      name: event.summary || 'Booking',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      customer: (() => {
        const matches = customersByPhone.get(phoneFromFirstLine(event.description)) || [];
        return matches.length === 1 ? matches[0] : null;
      })()
    })) });
  } catch (error) {
    console.error('Could not list Google Calendar bookings:', error);
    res.status(503).json({ error: 'Google Kalender er ikke tilgængelig' });
  }
});

router.get('/google/connect', requireAdmin, (req, res) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_OAUTH_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_OAUTH_REDIRECT_URI) return res.status(503).send('Google OAuth er ikke konfigureret.');
  const state = randomBytes(32).toString('hex');
  req.session.googleOAuthState = state;
  req.session.save(error => {
    if (error) return res.sendStatus(503);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state
    }).toString();
    res.redirect(url.toString());
  });
});

router.get('/google/callback', requireAdmin, async (req, res) => {
  const expectedState = req.session.googleOAuthState;
  delete req.session.googleOAuthState;
  if (!sameSecret(req.query.state, expectedState) || !req.query.code) {
    return res.status(400).send('Google-login kunne ikke gennemføres. Prøv igen fra administrationen.');
  }
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
    const tokens = await response.json();
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
    if (!process.env.GOOGLE_CALENDAR_ID) throw new Error('GOOGLE_CALENDAR_ID is not configured');
    const check = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}/events?maxResults=1`,
      { headers: { authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!check.ok) throw new Error(`Selected Google calendar is not accessible: ${check.status}`);
    await saveRefreshToken(tokens.refresh_token);
    await syncGoogleCalendar();
    res.type('html').send('<p>Google Kalender er forbundet. Du kan lukke denne fane og vende tilbage til administrationen.</p>');
  } catch (error) {
    console.error('Google Calendar OAuth failed:', error);
    res.status(502).send('Google Kalender kunne ikke forbindes. Kontroller serveropsætningen og prøv igen.');
  }
});

router.post('/google/webhook', (req, res) => {
  const { GOOGLE_CALENDAR_CHANNEL_ID, GOOGLE_CALENDAR_CHANNEL_TOKEN,
    GOOGLE_CALENDAR_RESOURCE_ID } = process.env;
  if (!GOOGLE_CALENDAR_CHANNEL_ID || !GOOGLE_CALENDAR_CHANNEL_TOKEN || !GOOGLE_CALENDAR_RESOURCE_ID ||
      !sameSecret(req.get('x-goog-channel-id'), GOOGLE_CALENDAR_CHANNEL_ID) ||
      !sameSecret(req.get('x-goog-channel-token'), GOOGLE_CALENDAR_CHANNEL_TOKEN) ||
      !sameSecret(req.get('x-goog-resource-id'), GOOGLE_CALENDAR_RESOURCE_ID)) {
    return res.sendStatus(403);
  }
  const state = req.get('x-goog-resource-state');
  if (!['sync', 'exists'].includes(state)) return res.sendStatus(204);
  res.sendStatus(204);
  if (state === 'sync') return;
  if (!pendingSync) {
    pendingSync = syncGoogleCalendar()
      .catch(error => console.error('Google Calendar sync failed:', error))
      .finally(() => { pendingSync = null; });
  }
});

module.exports = router;
