const { prisma } = require('../database/prisma');

const calendarId = () => process.env.GOOGLE_CALENDAR_ID;

async function accessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
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

module.exports = { accessToken, syncGoogleCalendar };
