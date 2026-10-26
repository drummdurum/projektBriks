const express = require('express');
const request = require('supertest');

jest.mock('../database/prisma', () => ({ prisma: {} }));
jest.mock('../utils/email', () => ({
  sendBookingFinalConfirmation: jest.fn(), sendBookingCancellation: jest.fn()
}));
jest.mock('../utils/googleCalendar', () => ({ createGoogleBooking: jest.fn() }));

const app = express();
const regenerate = jest.fn(callback => callback());
const save = jest.fn(callback => callback());
app.use(express.json());
app.use((req, res, next) => {
  req.session = {
    regenerate,
    save
  };
  next();
});
app.use('/api/admin', require('../routes/admin'));

beforeAll(() => {
  process.env.ADMIN_USERNAME = 'security-test-admin';
  process.env.ADMIN_PASSWORD = 'security-test-password';
});

afterAll(() => {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
});

test('successful login regenerates and saves the session', async () => {
  regenerate.mockClear();
  save.mockClear();
  const response = await request(app).post('/api/admin/login').send({
    username: 'security-test-admin', password: 'security-test-password'
  });
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(regenerate).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
});

test('repeated invalid login attempts are limited', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await request(app).post('/api/admin/login').send({
      username: 'security-test-admin', password: 'incorrect'
    });
    expect(response.status).toBe(401);
  }
  const blocked = await request(app).post('/api/admin/login').send({
    username: 'security-test-admin', password: 'incorrect'
  });
  expect(blocked.status).toBe(429);
});
