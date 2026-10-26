const express = require('express');
const request = require('supertest');

jest.mock('../utils/email', () => ({ sendBookingConfirmation: jest.fn() }));
jest.mock('../utils/resend', () => ({ sendEmailResend: jest.fn().mockResolvedValue() }));
jest.mock('../utils/calendarAvailability', () => ({ calendarBookedTimes: jest.fn() }));

const { sendEmailResend } = require('../utils/resend');
const { calendarBookedTimes } = require('../utils/calendarAvailability');
const app = express().use(express.json()).use('/api/mail', require('../routes/publicMail'));
const payload = {
  navn: 'Test Kunde', email: 'kunde@example.com', telefon: '12345678',
  besked: 'Ønsker en tid', gdpr_samtykke: true,
  datoer: [{ dato: '2027-01-04', tid: '10:00' }]
};

beforeEach(() => {
  process.env.GOOGLE_CALENDAR_ID = 'booking-calendar';
  process.env.FROM_EMAIL = 'clinic@example.com';
  process.env.NOTIFICATION_EMAIL = 'clinic@example.com';
  jest.clearAllMocks();
});

afterAll(() => { delete process.env.GOOGLE_CALENDAR_ID; });

test('rejects a requested slot occupied in Google Calendar', async () => {
  calendarBookedTimes.mockResolvedValue(['10:00']);
  const response = await request(app).post('/api/mail/contact').send(payload);
  expect(response.status).toBe(409);
  expect(sendEmailResend).not.toHaveBeenCalled();
});

test('sends a request without reserving the calendar slot', async () => {
  calendarBookedTimes.mockResolvedValue([]);
  const response = await request(app).post('/api/mail/contact').send(payload);
  expect(response.status).toBe(200);
  expect(sendEmailResend).toHaveBeenCalledTimes(1);
});
