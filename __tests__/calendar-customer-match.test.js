const express = require('express');
const request = require('supertest');

jest.mock('../database/prisma', () => ({ prisma: { user: { findMany: jest.fn() } } }));
jest.mock('../utils/googleCalendar', () => ({
  listGoogleCalendarEvents: jest.fn(), syncGoogleCalendar: jest.fn()
}));
jest.mock('../utils/calendarToken', () => ({ saveRefreshToken: jest.fn() }));

const { prisma } = require('../database/prisma');
const { listGoogleCalendarEvents } = require('../utils/googleCalendar');
const app = express();
app.use((req, res, next) => { req.session = { isAdmin: true }; next(); });
app.use('/api/calendar', require('../routes/googleCalendar'));

beforeEach(() => {
  process.env.GOOGLE_CALENDAR_ID = 'booking-calendar';
  jest.clearAllMocks();
  listGoogleCalendarEvents.mockResolvedValue([{
    id: 'event-1', summary: 'Aftale', description: '+45 12 34 56 78\nOpfølgning',
    start: { dateTime: '2027-01-04T09:00:00Z' },
    end: { dateTime: '2027-01-04T11:00:00Z' }
  }]);
});

afterAll(() => { delete process.env.GOOGLE_CALENDAR_ID; });

test('first description line matches a customer by normalized phone number', async () => {
  prisma.user.findMany.mockResolvedValue([{
    id: 7, navn: 'Anna', efternavn: 'Jensen', telefon: '12 34 56 78', email: 'anna@example.com'
  }]);
  const response = await request(app).get('/api/calendar/google/bookings');
  expect(response.status).toBe(200);
  expect(response.body.bookings[0].customer.id).toBe(7);
});

test('ambiguous phone numbers are not matched automatically', async () => {
  prisma.user.findMany.mockResolvedValue([
    { id: 7, navn: 'Anna', efternavn: 'Jensen', telefon: '12345678' },
    { id: 8, navn: 'Bo', efternavn: 'Jensen', telefon: '+45 12345678' }
  ]);
  const response = await request(app).get('/api/calendar/google/bookings');
  expect(response.body.bookings[0].customer).toBeNull();
});
