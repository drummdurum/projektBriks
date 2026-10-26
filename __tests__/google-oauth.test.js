const express = require('express');
const session = require('express-session');
const request = require('supertest');

jest.mock('../utils/googleCalendar', () => ({ syncGoogleCalendar: jest.fn().mockResolvedValue(1) }));
jest.mock('../utils/calendarToken', () => ({ saveRefreshToken: jest.fn().mockResolvedValue() }));

const { saveRefreshToken } = require('../utils/calendarToken');
const router = require('../routes/googleCalendar');
const app = express();
app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
app.get('/test-login', (req, res) => { req.session.isAdmin = true; res.sendStatus(204); });
app.use('/api/calendar', router);

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/calendar/google/callback';
  process.env.GOOGLE_CALENDAR_ID = 'example@gmail.com';
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh' }) })
    .mockResolvedValueOnce({ ok: true });
  saveRefreshToken.mockClear();
});

afterEach(() => { delete global.fetch; });

test('only an administrator can start Google consent', async () => {
  expect((await request(app).get('/api/calendar/google/connect')).status).toBe(401);
});

test('OAuth callback rejects invalid state without saving a token', async () => {
  const agent = request.agent(app);
  await agent.get('/test-login');
  const response = await agent.get('/api/calendar/google/callback?code=code&state=wrong');
  expect(response.status).toBe(400);
  expect(saveRefreshToken).not.toHaveBeenCalled();
});

test('OAuth callback saves token after checking calendar access', async () => {
  const agent = request.agent(app);
  await agent.get('/test-login');
  const start = await agent.get('/api/calendar/google/connect');
  expect(start.status).toBe(302);
  const state = new URL(start.headers.location).searchParams.get('state');
  const callback = await agent.get(`/api/calendar/google/callback?code=code&state=${state}`);
  expect(callback.status).toBe(200);
  expect(saveRefreshToken).toHaveBeenCalledWith('refresh');
});
