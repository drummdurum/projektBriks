const { prisma } = require('../database/prisma');
const { getRefreshToken } = require('./calendarToken');

const calendarId = () => process.env.GOOGLE_CALENDAR_ID;

async function listGoogleCalendarEvents(timeMin, timeMax) {
  if (!calendarId()) throw new Error('GOOGLE_CALENDAR_ID is not configured');
  const token = await accessToken();
  const events = [];
  let pageToken;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`);
    url.searchParams.set('timeMin', timeMin.toISOString());
    url.searchParams.set('timeMax', timeMax.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('maxResults', '2500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Calendar request failed: ${response.status}`);
    const data = await response.json();
    events.push(...(data.items || []).filter(event => event.status !== 'cancelled'));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return events;
}

async function createGoogleBooking({ navn, telefon, email, ønsket_dato, ønsket_tid,
  behandling, betaling, besked }) {
  const { localDateTimeToUtc } = require('./copenhagenTime');
  const start = localDateTimeToUtc(ønsket_dato, ønsket_tid);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const existing = await listGoogleCalendarEvents(
    new Date(start.getTime() - 86400000), new Date(end.getTime() + 86400000)
  );
  if (existing.some(event => {
    const eventStart = new Date(event.start?.dateTime || `${event.start?.date}T00:00:00Z`);
    const eventEnd = new Date(event.end?.dateTime || `${event.end?.date}T00:00:00Z`);
    return eventStart < end && eventEnd > start;
  })) return null;
  const description = [
    `Telefon: ${telefon}`,
    email ? `Email: ${email}` : null,
    behandling ? `Behandling: ${behandling}` : null,
    betaling ? `Betaling: ${betaling}` : null,
    besked ? `Note: ${besked}` : null
  ].filter(Boolean).join('\n');
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`,
    { method: 'POST', headers: {
      authorization: `Bearer ${await accessToken()}`,
      'content-type': 'application/json'
    }, body: JSON.stringify({ summary: navn, description,
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Copenhagen' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Copenhagen' } }) }
  );
  if (!response.ok) throw new Error(`Google Calendar booking creation failed: ${response.status}`);
  return response.json();
}

async function accessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  const GOOGLE_REFRESH_TOKEN = await getRefreshToken();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google Calendar credentials are not configured');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' })
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  return (await response.json()).access_token;
}

async function syncGoogleCalendar() {
  if (!calendarId()) throw new Error('GOOGLE_CALENDAR_ID is not configured');
  const token = await accessToken();
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const until = new Date(now);
  until.setUTCFullYear(until.getUTCFullYear() + 1);
  const events = [];
  let pageToken;
  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId())}/events`);
    url.searchParams.set('timeMin', from.toISOString());
    url.searchParams.set('timeMax', until.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('maxResults', '2500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Calendar request failed: ${response.status}`);
    const data = await response.json();
    for (const event of data.items || []) {
      if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
      const start = new Date(event.start?.dateTime || `${event.start?.date}T00:00:00Z`);
      const end = new Date(event.end?.dateTime || `${event.end?.date}T00:00:00Z`);
      if (!event.id || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      events.push({ id: event.id, start_time: start, end_time: end });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  // Replace only after every Google page has been fetched successfully.
  await prisma.$transaction(async tx => {
    await tx.googleCalendarEvent.deleteMany();
    if (events.length) await tx.googleCalendarEvent.createMany({ data: events });
  });
  return events.length;
}

module.exports = { accessToken, listGoogleCalendarEvents, createGoogleBooking, syncGoogleCalendar };
