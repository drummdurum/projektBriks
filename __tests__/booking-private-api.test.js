const express = require('express');
const request = require('supertest');

jest.mock('../database/prisma', () => ({ prisma: {} }));
jest.mock('../utils/email', () => ({ sendBookingConfirmation: jest.fn(), sendBookingNotification: jest.fn() }));
const app = express().use(express.json()).use('/api/bookings', require('../routes/bookings'));

test('legacy customer records and status changes require admin login', async () => {
  expect((await request(app).get('/api/bookings')).status).toBe(401);
  expect((await request(app).get('/api/bookings/search?q=te')).status).toBe(401);
  expect((await request(app).put('/api/bookings/1/status').send({ status: 'cancelled' })).status).toBe(401);
});
