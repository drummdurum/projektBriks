const schedule = require('../public/js/booking-schedule');
const express = require('express');
const { prisma } = require('../database/prisma');
const { calendarBookedTimes } = require('../utils/calendarAvailability');

const router = express.Router();

// GET /api/availability?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !schedule.parseDate(date)) {
      return res.status(400).json({ error: 'Ugyldig dato; brug YYYY-MM-DD' });
    }
    const allowedTimes = schedule.timesForDate(date);
    if (!allowedTimes.length) {
      return res.json({ blocked: true, reason: 'Weekend', bookedTimes: [], blockedTimes: [], allowedTimes });
    }

    // Google owns appointments. Read live and never expose customer details here.
    if (process.env.GOOGLE_CALENDAR_ID) {
      const bookedTimes = await calendarBookedTimes(date, allowedTimes);
      return res.json({ blocked: false, bookedTimes, blockedTimes: [], allowedTimes });
    }

    // Legacy availability when Google Calendar is not configured.
    const targetDate = new Date(date);
    const blocked = await prisma.blockedDate.findFirst({
      where: { AND: [
        { start_date: { lte: targetDate } },
        { end_date: { gte: targetDate } }
      ] }
    });
    if (blocked) {
      return res.json({ blocked: true, reason: blocked.reason || null,
        bookedTimes: [], blockedTimes: [], allowedTimes: [] });
    }
    const [bookings, blockedTimesRows] = await Promise.all([
      prisma.booking.findMany({
        where: { ønsket_dato: targetDate, NOT: { status: 'cancelled' } },
        select: { ønsket_tid: true }
      }),
      prisma.blockedTime.findMany({ where: { date: targetDate }, select: { time: true } })
    ]);
    res.json({ blocked: false,
      bookedTimes: bookings.map(b => b.ønsket_tid).filter(Boolean),
      blockedTimes: blockedTimesRows.map(b => b.time).filter(Boolean), allowedTimes });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(503).json({ error: 'Kalenderen er midlertidigt utilgængelig; prøv igen senere' });
  }
});

module.exports = router;
