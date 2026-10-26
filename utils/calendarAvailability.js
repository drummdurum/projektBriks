const { listGoogleCalendarEvents } = require('./googleCalendar');
const { localDateTimeToUtc } = require('./copenhagenTime');

async function calendarBookedTimes(date, allowedTimes) {
  const day = Date.parse(`${date}T00:00:00Z`);
  const events = await listGoogleCalendarEvents(
    new Date(day - 86400000), new Date(day + 2 * 86400000)
  );
  return allowedTimes.filter(time => {
    const start = localDateTimeToUtc(date, time).getTime();
    const end = start + 2 * 60 * 60 * 1000;
    return events.some(event => {
      const eventStart = new Date(event.start?.dateTime || `${event.start?.date}T00:00:00Z`).getTime();
      const eventEnd = new Date(event.end?.dateTime || `${event.end?.date}T00:00:00Z`).getTime();
      return eventStart < end && eventEnd > start;
    });
  });
}

module.exports = { calendarBookedTimes };
