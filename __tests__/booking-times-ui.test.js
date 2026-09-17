/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/booking.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const response = data => ({ ok: true, json: async () => data });
let date, time;
beforeEach(() => {
    document.body.innerHTML = `<form id="booking-form">
        <input id="navn"><input id="email"><input id="telefon"><textarea id="besked"></textarea>
        <input id="ønsket_dato" type="hidden"><select id="ønsket_tid"></select>
        <input id="gdpr_samtykke" type="checkbox"><button id="submit-btn"></button>
        <span id="submit-text"></span><span id="submit-loading"></span>
        </form><div id="success-message"></div><div id="error-message"></div>
        <div id="error-text"></div><div id="availability-msg"></div>`;
    window.BookingSchedule = require('../public/js/booking-schedule');
    window.fetch = jest.fn().mockResolvedValue(response({ bookedTimes: [], blockedTimes: [] }));
    // Capture and run this file's ready callback without triggering other scripts.
    const original = document.addEventListener.bind(document);
    const listener = jest.spyOn(document, 'addEventListener').mockImplementation((name, callback, options) => {
        if (name === 'DOMContentLoaded') callback();
        else original(name, callback, options);
    });
    window.eval(source);
    listener.mockRestore();
    date = document.getElementById('ønsket_dato');
    time = document.getElementById('ønsket_tid');
});
async function selectDate(value) {
    date.value = value;
    date.dispatchEvent(new Event('change'));
    await flush();
}
test('Switching to Wednesday clears 19:00 and retains 14:00 as an option', async () => {
    await selectDate('2026-09-21');
    time.value = '19:00';
    await selectDate('2026-09-23');
    expect(time.value).toBe('');
    expect(Array.from(time.options, option => option.value)).toEqual(['', '10:00', '12:00', '14:00']);
    expect(time.disabled).toBe(false);
});
test('Booked and blocked times cannot be selected and a blocked selection clears', async () => {
    await selectDate('2026-09-21');
    time.value = '14:00';
    window.fetch.mockResolvedValue(response({ bookedTimes: ['14:00'], blockedTimes: ['12:00'] }));
    await selectDate('2026-09-23');
    expect(time.value).toBe('');
    expect(time.querySelector('[value="14:00"]').disabled).toBe(true);
    expect(time.querySelector('[value="12:00"]').disabled).toBe(true);
});
test('Weekend and clearing the date disable the time field', async () => {
    await selectDate('2026-09-26');
    expect(time.disabled).toBe(true);
    expect(window.fetch).not.toHaveBeenCalled();
    await selectDate('2026-09-21');
    await selectDate('');
    expect(time.disabled).toBe(true);
    expect(time.options).toHaveLength(1);
});
test('A late response for Monday cannot overwrite Wednesday availability', async () => {
    let resolveMonday;
    window.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveMonday = resolve; }));
    await selectDate('2026-09-21');
    await selectDate('2026-09-23');
    resolveMonday(response({ bookedTimes: ['14:00'], blockedTimes: [] }));
    await flush();
    expect(time.querySelector('[value="14:00"]').disabled).toBe(false);
    expect(time.querySelector('[value="19:00"]')).toBeNull();
});
test('Failed availability leaves time selection disabled', async () => {
    window.fetch.mockRejectedValue(new Error('Network unavailable'));
    await selectDate('2026-09-21');
    expect(time.disabled).toBe(true);
    expect(time.value).toBe('');
});
