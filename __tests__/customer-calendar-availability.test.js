/** @jest-environment jsdom */

test('customer sees booked slots without customer details', async () => {
  document.body.innerHTML = `
    <span id="currentYear"></span>
    <div id="contact-status" class="hidden"></div>
    <form id="contact-form"><div id="date-fields">
      <div class="date-row"><input type="date" name="dato"><select name="tid"></select></div>
    </div><button id="contact-submit"></button></form>
    <button id="add-date"></button>`;
  global.BookingSchedule = require('../public/js/booking-schedule');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
    blocked: false, bookedTimes: ['10:00'], blockedTimes: [],
    allowedTimes: ['10:00', '12:00', '14:00', '16:00', '19:00']
  }) });
  jest.resetModules();
  require('../public/js/contact');
  const date = document.querySelector('input[type="date"]');
  date.value = '2027-01-04';
  date.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const options = [...document.querySelectorAll('select[name="tid"] option')];
  expect(options.find(option => option.value === '10:00').disabled).toBe(true);
  expect(options.find(option => option.value === '12:00').disabled).toBe(false);
  expect(document.body.textContent).not.toContain('Test Kunde');
});
