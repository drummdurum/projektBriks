(function (root) {
    const longDays = [1, 2, 4];
    function parseDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
        const date = new Date(`${value}T12:00:00Z`);
        return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
    }
    function timesForDate(value) {
        const date = parseDate(value);
        if (!date || [0, 6].includes(date.getUTCDay())) return [];
        return longDays.includes(date.getUTCDay())
            ? ['10:00', '12:00', '14:00', '16:00', '19:00']
            : ['10:00', '12:00', '14:00'];
    }
    function validate(date, time) {
        if (!date) return time ? 'Vælg en dato før tidspunktet.' : null;
        if (!parseDate(date)) return 'Vælg en gyldig dato.';
        const times = timesForDate(date);
        if (!times.length) return 'Booking i weekenden er ikke mulig.';
        if (time && !times.includes(time)) return 'Tidspunktet kan ikke bookes på den valgte ugedag.';
        return null;
    }
    const schedule = { parseDate, timesForDate, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = schedule;
    else root.BookingSchedule = schedule;
})(typeof window !== 'undefined' ? window : globalThis);
