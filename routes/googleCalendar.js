const express = require('express');
const { timingSafeEqual } = require('crypto');
const { syncGoogleCalendar } = require('../utils/googleCalendar');

const router = express.Router();
let pendingSync = null;

function sameSecret(received, expected) {
  if (typeof received !== 'string' || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
