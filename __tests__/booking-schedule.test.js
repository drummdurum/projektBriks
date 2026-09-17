require('./setup');
const request = require('supertest');
const express = require('express');
const schedule = require('../public/js/booking-schedule');
const { prisma } = require('../database/prisma');
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.session = { isAdmin: true }; next(); });
app.use('/bookings', require('../routes/bookings'));
app.use('/admin', require('../routes/admin'));
app.use('/availability', require('../routes/availability'));
const booking = { navn: 'Test Person', email: 'test@example.com', telefon: '12345678', gdpr_samtykke: 'true' };

beforeEach(() => {
    jest.resetAllMocks();
    prisma.booking.findFirst.mockResolvedValue(null);
    prisma.blockedDate.findFirst.mockResolvedValue(null);
    prisma.blockedTime.findFirst.mockResolvedValue(null);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.blockedTime.findMany.mockResolvedValue([]);
    prisma.booking.create.mockImplementation(async ({ data }) => ({ ...data, id: 1, created_at: new Date() }));
});

test.each(['2026-09-21', '2026-09-22', '2026-09-24'])('Long day %s includes 19:00', date => {
    expect(schedule.timesForDate(date)).toEqual(['10:00', '12:00', '14:00', '16:00', '19:00']);
});
test.each(['2026-09-23', '2026-09-25'])('Short day %s includes 14:00 and excludes evening times', date => {
    expect(schedule.timesForDate(date)).toEqual(['10:00', '12:00', '14:00']);
});
test.each(['2026-09-26', '2026-09-27', '2026-02-30', 'invalid'])('Closed or invalid date %s has no times', date => {
    expect(schedule.timesForDate(date)).toEqual([]);
});

describe.each(['/bookings', '/admin/bookings'])('Booking endpoint %s', endpoint => {
    test.each([
        ['2026-09-21', '19:00'], ['2026-09-22', '19:00'], ['2026-09-24', '19:00'],
        ['2026-09-23', '14:00'], ['2026-09-25', '14:00']
    ])('Accepts last start time %s %s', async (date, time) => {
        const response = await request(app).post(endpoint).send({ ...booking, ønsket_dato: date, ønsket_tid: time });
        expect(response.status).toBe(endpoint === '/bookings' ? 201 : 200);
        expect(prisma.booking.create).toHaveBeenCalledTimes(1);
    });
    test.each([
        ['2026-09-23', '16:00'], ['2026-09-25', '19:00'], ['2026-09-21', '20:00'],
        ['2026-09-21', '09:00'], ['2026-09-26', '10:00'], ['2026-09-27', '14:00'],
        ['2026-02-30', '10:00']
    ])('Rejects unavailable start time %s %s before creating a booking', async (date, time) => {
        const response = await request(app).post(endpoint).send({ ...booking, ønsket_dato: date, ønsket_tid: time });
        expect(response.status).toBe(400);
        expect(prisma.booking.create).not.toHaveBeenCalled();
    });
    test('Still rejects occupied and blocked last start times', async () => {
        prisma.booking.findFirst.mockResolvedValue({ id: 2 });
        expect((await request(app).post(endpoint).send({ ...booking, ønsket_dato: '2026-09-21', ønsket_tid: '19:00' })).status).toBe(400);
        prisma.booking.findFirst.mockResolvedValue(null);
        prisma.blockedTime.findFirst.mockResolvedValue({ time: '19:00' });
        expect((await request(app).post(endpoint).send({ ...booking, ønsket_dato: '2026-09-21', ønsket_tid: '19:00' })).status).toBe(400);
        expect(prisma.booking.create).not.toHaveBeenCalled();
    });
});
test('Availability exposes weekday times and keeps booked and blocked times', async () => {
    prisma.booking.findMany.mockResolvedValue([{ ønsket_tid: '14:00' }]);
    prisma.blockedTime.findMany.mockResolvedValue([{ time: '12:00' }]);
    const response = await request(app).get('/availability?date=2026-09-23');
    expect(response.body).toEqual({ blocked: false, allowedTimes: ['10:00', '12:00', '14:00'], bookedTimes: ['14:00'], blockedTimes: ['12:00'] });
});
test('Weekend availability is closed without querying bookings', async () => {
    const response = await request(app).get('/availability?date=2026-09-26');
    expect(response.body.blocked).toBe(true);
    expect(response.body.allowedTimes).toEqual([]);
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
});
test('A time without a date is rejected', async () => {
    expect((await request(app).post('/bookings').send({ ...booking, ønsket_tid: '19:00' })).status).toBe(400);
});
