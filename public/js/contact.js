document.getElementById('currentYear').textContent = new Date().getFullYear();

const form = document.getElementById('contact-form');
const status = document.getElementById('contact-status');
const submit = document.getElementById('contact-submit');
const dateFields = document.getElementById('date-fields');
const addDate = document.getElementById('add-date');

function localToday() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function updateDates() {
  const rows = [...dateFields.querySelectorAll('.date-row')];
  rows.forEach((row, index) => {
    const date = row.querySelector('input[type="date"]');
    const time = row.querySelector('select[name="tid"]');
    date.min = localToday();
    date.setAttribute('aria-label', `Foreslået dato ${index + 1}`);
    time.setAttribute('aria-label', `Foreslået tidspunkt ${index + 1}`);
  });
  addDate.disabled = rows.length >= 5;
  addDate.classList.toggle('hidden', rows.length >= 5);
}

addDate.addEventListener('click', () => {
  if (dateFields.querySelectorAll('input[type="date"]').length >= 5) return;
  const row = document.createElement('div');
  row.className = 'date-row flex flex-wrap gap-2 items-center';
  const input = document.createElement('input');
  input.type = 'date';
  input.name = 'dato';
  input.className = 'flex-1 min-w-36 px-3 py-2 border border-gray-300 rounded-md';
  const time = dateFields.querySelector('select[name="tid"]').cloneNode(true);
  time.value = '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Fjern';
  remove.className = 'text-red-700 hover:underline';
  remove.setAttribute('aria-label', 'Fjern foreslået dato');
  remove.addEventListener('click', () => {
    row.remove();
    updateDates();
  });
  row.append(input, time, remove);
  dateFields.append(row);
  updateDates();
  input.focus();
});
updateDates();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submit.disabled = true;
  status.classList.add('hidden');
  try {
    const data = new FormData(form);
    const datoer = [...dateFields.querySelectorAll('.date-row')].map(row => ({
      dato: row.querySelector('input[type="date"]').value,
      tid: row.querySelector('select[name="tid"]').value
    })).filter(item => item.dato || item.tid);
    if (datoer.some(item => item.tid && !item.dato)) {
      status.textContent = 'Vælg en dato til hvert foreslået tidspunkt.';
      status.className = 'mb-5 rounded-md p-4 bg-red-100 text-red-800';
      submit.disabled = false;
      return;
    }
    if (datoer.some(item => item.tid && (item.tid < '10:00' || item.tid > '19:00' || !/:(00|30)$/.test(item.tid)))) {
      status.textContent = 'Vælg venligst en hel eller halv time mellem kl. 10:00 og 19:00.';
      status.className = 'mb-5 rounded-md p-4 bg-red-100 text-red-800';
      submit.disabled = false;
      return;
    }
    const response = await fetch('/api/mail/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        navn: data.get('navn'),
        email: data.get('email'),
        besked: data.get('besked'),
        datoer,
        gdpr_samtykke: data.get('gdpr_samtykke') === 'on'
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Beskeden kunne ikke sendes.');
    status.textContent = 'Tak for din besked. Jeg vender tilbage hurtigst muligt.';
    status.className = 'mb-5 rounded-md p-4 bg-green-100 text-green-800';
    form.reset();
    dateFields.querySelectorAll('.date-row:not(:first-child)').forEach(row => row.remove());
    updateDates();
  } catch (error) {
    status.textContent = error.message || 'Beskeden kunne ikke sendes. Ring venligst i stedet.';
    status.className = 'mb-5 rounded-md p-4 bg-red-100 text-red-800';
  } finally {
    submit.disabled = false;
  }
});
