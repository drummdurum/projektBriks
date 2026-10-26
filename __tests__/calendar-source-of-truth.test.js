const express = require('express');
const request = require('supertest');

jest.mock('../database/prisma', () => ({ prisma: {
  booking: { findMany: jest.fn() },
  blockedDate: { findFirst: jest.fn() },
  blockedTime: { findMany: jest.fn() }
} }));
jest.mock('../utils/googleCalendar', () => ({ listGoogleCalendarEvents: jest.fn() }));

const { prisma } = require('../database/prisma');
const { listGoogleCalendarEvents } = require('../utils/googleCalendar');
const app = express().use('/api/availability', require('../routes/availability'));

beforeEach(() => {
  process.env.GOOGLE_CALENDAR_ID = 'booking-calendar';
  jest.clearAllMocks();
});

afterAll(() => { delete process.env.GOOGLE_CALENDAR_ID; });

test('availability follows live Google events and ignores stale local bookings', async () => {
  listGoogleCalendarEvents.mockResolvedValue([{
    start: { dateTime: '2026-10-27T09:00:00Z' },
    end: { dateTime: '2026-10-27T11:00:00Z' }
  }]);
  const response = await request(app).get('/api/availability?date=2026-10-27');
  expect(response.status).toBe(200);
  expect(response.body.bookedTimes).toContain('10:00');
  expect(response.body.bookedTimes).not.toContain('12:00');
  expect(prisma.booking.findMany).not.toHaveBeenCalled();
});

test('calendar failure does not present unverified slots as available', async () => {
  listGoogleCalendarEvents.mockRejectedValue(new Error('Google unavailable'));
  const response = await request(app).get('/api/availability?date=2026-10-27');
  expect(response.status).toBe(503);
});
