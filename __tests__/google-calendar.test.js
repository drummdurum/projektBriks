const request = require('supertest');

jest.mock('../utils/googleCalendar', () => ({ syncGoogleCalendar: jest.fn().mockResolvedValue(1) }));
const sync = require('../utils/googleCalendar').syncGoogleCalendar;
const router = require('../routes/googleCalendar');
const express = require('express');
const app = express().use('/api/calendar', router);

beforeEach(() => {
  process.env.GOOGLE_CALENDAR_CHANNEL_ID = 'test-channel';
  process.env.GOOGLE_CALENDAR_CHANNEL_TOKEN = 'test-secret';
  process.env.GOOGLE_CALENDAR_RESOURCE_ID = 'test-resource';
  sync.mockClear();
});

test('rejects an unauthenticated calendar notification', async () => {
  const response = await request(app).post('/api/calendar/google/webhook');
  expect(response.status).toBe(403);
  expect(sync).not.toHaveBeenCalled();
});

test('accepts a valid change notification and starts synchronization', async () => {
  const response = await request(app).post('/api/calendar/google/webhook')
    .set('X-Goog-Channel-Id', 'test-channel')
    .set('X-Goog-Channel-Token', 'test-secret')
    .set('X-Goog-Resource-Id', 'test-resource')
    .set('X-Goog-Resource-State', 'exists');
  expect(response.status).toBe(204);
  expect(sync).toHaveBeenCalledTimes(1);
});
