const express = require('express');
const request = require('supertest');

jest.mock('../database/prisma', () => ({ prisma: { booking: { create: jest.fn() } } }));
jest.mock('../utils/email', () => ({
  sendBookingFinalConfirmation: jest.fn(), sendBookingCancellation: jest.fn()
}));
jest.mock('../utils/googleCalendar', () => ({ createGoogleBooking: jest.fn() }));

const { prisma } = require('../database/prisma');
const { createGoogleBooking } = require('../utils/googleCalendar');
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.session = { isAdmin: true }; next(); });
app.use('/api/admin', require('../routes/admin'));

beforeEach(() => {
  process.env.GOOGLE_CALENDAR_ID = 'booking-calendar';
  jest.clearAllMocks();
});

afterAll(() => { delete process.env.GOOGLE_CALENDAR_ID; });

test('manual booking writes to Google instead of creating a local authoritative booking', async () => {
  createGoogleBooking.mockResolvedValue({ id: 'google-event-id' });
  const response = await request(app).post('/api/admin/bookings').send({
    navn: 'Test Kunde', telefon: '12345678', email: 'kunde@example.com',
    ønsket_dato: '2027-01-04', ønsket_tid: '10:00'
  });
  expect(response.status).toBe(200);
  expect(response.body.booking.id).toBe('google-event-id');
  expect(prisma.booking.create).not.toHaveBeenCalled();
});
