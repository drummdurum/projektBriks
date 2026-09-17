/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

beforeEach(() => {
    document.body.innerHTML = '<form><input id="date" name="ønsket_dato" type="date"></form>';
    window.BookingSchedule = require('../public/js/booking-schedule');
    window.eval(fs.readFileSync(path.join(__dirname, '../public/js/booking-calendar.js'), 'utf8'));
});
function mount() {
    const input = document.getElementById('date');
    const calendar = window.BookingCalendar.mount(input, new Date(2026, 8, 21));
    return { input, calendar };
}
test('Saturday and Sunday cannot be selected; weekdays can', () => {
    const { input, calendar } = mount();
    for (const date of ['2026-09-26', '2026-09-27']) {
        const button = calendar.querySelector(`[data-date="${date}"]`);
        expect(button.disabled).toBe(true);
        button.click();
        expect(input.value).toBe('');
    }
    const change = jest.fn();
    input.addEventListener('change', change);
    calendar.querySelector('[data-date="2026-09-23"]').click();
    expect(input.value).toBe('2026-09-23');
    expect(change).toHaveBeenCalledTimes(1);
    expect(calendar.querySelector('[data-date="2026-09-23"]').getAttribute('aria-pressed')).toBe('true');
});
test('Past days and previous month are disabled', () => {
    const { calendar } = mount();
    expect(calendar.querySelector('[data-date="2026-09-18"]').disabled).toBe(true);
    expect(calendar.querySelector('[aria-label="Forrige måned"]').disabled).toBe(true);
});
test('Next month keeps weekends disabled and form reset clears date', () => {
    const { input, calendar } = mount();
    calendar.querySelector('[aria-label="Næste måned"]').click();
    expect(calendar.querySelector('[data-date="2026-10-03"]').disabled).toBe(true);
    calendar.querySelector('[data-date="2026-10-01"]').click();
    input.form.reset();
    expect(input.value).toBe('');
    expect(calendar.querySelector('[aria-pressed="true"]')).toBeNull();
});
