const schedule = require('../public/js/booking-schedule');
const express = require('express');
const router = express.Router();
const { prisma } = require('../database/prisma');

const localParts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function slotStart(date, time) {
    const [hour, minute] = time.split(':').map(Number);
    let timestamp = Date.parse(`${date}T${time}:00Z`);
    const [year, month, day] = date.split('-').map(Number);
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    for (let i = 0; i < 2; i++) {
        const parts = Object.fromEntries(localParts.formatToParts(new Date(timestamp)).map(p => [p.type, Number(p.value)]));
        const observed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
        timestamp += desired - observed;
    }
    return timestamp;
}

// GET /api/availability?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date parameter required' });

    // Validate date format (ISO YYYY-MM-DD)
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(date)) return res.status(400).json({ error: 'Invalid date format, expected YYYY-MM-DD' });

    if (!schedule.parseDate(date)) return res.status(400).json({ error: 'Invalid date' });
    const allowedTimes = schedule.timesForDate(date);
    if (!allowedTimes.length) return res.json({ blocked: true, reason: 'Weekend', bookedTimes: [], blockedTimes: [], allowedTimes: [] });
    const targetDate = new Date(date);

    // Check blocked periods
    const blocked = await prisma.blockedDate.findFirst({
      where: {
        AND: [
          { start_date: { lte: targetDate } },
          { end_date: { gte: targetDate } }
        ]
      }
    });

    if (blocked) {
      return res.json({ blocked: true, reason: blocked.reason || null, bookedTimes: [], blockedTimes: [], allowedTimes: [] });
    }

    // Find booked times for that date (exclude cancelled)
    const bookings = await prisma.booking.findMany({
      where: {
        ønsket_dato: targetDate,
        NOT: { status: 'cancelled' }
      },
      select: { ønsket_tid: true }
    });

    // Find blocked time slots for that date
    const blockedTimesRows = await prisma.blockedTime.findMany({
      where: { date: targetDate },
      select: { time: true }
    });

    const calendarEvents = process.env.GOOGLE_CALENDAR_ID
      ? await prisma.googleCalendarEvent.findMany({
          where: {
            start_time: { lt: new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86400000) },
            end_time: { gt: new Date(Date.parse(`${date}T00:00:00Z`) - 86400000) }
          }
        })
      : [];

    const bookedTimes = bookings.map(b => b.ønsket_tid).filter(Boolean);
    const blockedTimes = blockedTimesRows.map(b => b.time).filter(Boolean);
    for (const time of allowedTimes) {
      const start = slotStart(date, time);
      const end = start + 2 * 60 * 60 * 1000;
      if (calendarEvents.some(event => event.start_time.getTime() < end && event.end_time.getTime() > start)) {
        blockedTimes.push(time);
      }
    }

    res.json({ blocked: false, bookedTimes, blockedTimes, allowedTimes });
  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: 'Fejl ved hentning af tilgængelighed' });
  }
});

module.exports = router;
