const { randomUUID, randomBytes } = require('crypto');
require('dotenv').config();
const { accessToken, syncGoogleCalendar } = require('../utils/googleCalendar');

async function main() {
  const { GOOGLE_CALENDAR_ID, GOOGLE_CALENDAR_WEBHOOK_URL } = process.env;
  if (!GOOGLE_CALENDAR_ID || !GOOGLE_CALENDAR_WEBHOOK_URL) {
    throw new Error('Set GOOGLE_CALENDAR_ID and GOOGLE_CALENDAR_WEBHOOK_URL first');
  }
  const channelId = randomUUID();
  const channelToken = randomBytes(32).toString('hex');
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events/watch`,
    { method: 'POST', headers: {
      authorization: `Bearer ${await accessToken()}`,
      'content-type': 'application/json'
    }, body: JSON.stringify({ id: channelId, type: 'web_hook',
      address: GOOGLE_CALENDAR_WEBHOOK_URL, token: channelToken }) }
  );
  if (!response.ok) throw new Error(`Google watch failed: ${response.status} ${await response.text()}`);
  const channel = await response.json();
  console.log('Save these values as private server environment variables:');
  console.log(`GOOGLE_CALENDAR_CHANNEL_ID=${channelId}`);
  console.log(`GOOGLE_CALENDAR_CHANNEL_TOKEN=${channelToken}`);
  console.log(`GOOGLE_CALENDAR_RESOURCE_ID=${channel.resourceId}`);
  console.log(`Channel expires: ${new Date(Number(channel.expiration)).toISOString()}`);
  console.log(`Initial sync: ${await syncGoogleCalendar()} busy events stored`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
