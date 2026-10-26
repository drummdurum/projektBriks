const localParts = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function localDateTimeToUtc(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = desired;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(localParts.formatToParts(new Date(timestamp)).map(p => [p.type, Number(p.value)]));
    const observed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    timestamp += desired - observed;
  }
  return new Date(timestamp);
}

function localDateAndTime(value) {
  const parts = Object.fromEntries(localParts.formatToParts(value).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

module.exports = { localDateTimeToUtc, localDateAndTime };
