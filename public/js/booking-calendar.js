// Inline calendar: native disabled buttons prevent weekend selection on all devices.
(function () {
    function mount(input, now = new Date()) {
        const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const today = iso(now);
        let month = new Date(now.getFullYear(), now.getMonth(), 1);
        input.type = 'hidden';
        const calendar = document.createElement('div');
        calendar.className = 'booking-calendar';
        calendar.setAttribute('aria-label', 'Vælg bookingdato');
        input.after(calendar);
        function render() {
            calendar.replaceChildren();
            const header = document.createElement('div');
            header.className = 'calendar-header';
            [-1, 0, 1].forEach(direction => {
                const element = document.createElement(direction ? 'button' : 'strong');
                if (direction) {
                    element.type = 'button';
                    element.textContent = direction < 0 ? '‹' : '›';
                    element.setAttribute('aria-label', direction < 0 ? 'Forrige måned' : 'Næste måned');
                    element.disabled = direction < 0 && month <= new Date(now.getFullYear(), now.getMonth(), 1);
                    element.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + direction, 1); render(); };
                } else element.textContent = month.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });
                header.append(element);
            });
            calendar.append(header);
            const grid = document.createElement('div');
            grid.className = 'calendar-grid';
            ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].forEach(day => {
                const label = document.createElement('span'); label.textContent = day; grid.append(label);
            });
            for (let offset = 0; offset < (month.getDay() + 6) % 7; offset++) grid.append(document.createElement('span'));
            const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
            for (let day = 1; day <= count; day++) {
                const date = new Date(month.getFullYear(), month.getMonth(), day);
                const value = iso(date);
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = day;
                button.dataset.date = value;
                button.setAttribute('aria-label', date.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
                button.setAttribute('aria-pressed', String(value === input.value));
                button.disabled = value < today || !BookingSchedule.timesForDate(value).length;
                button.onclick = () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); render(); };
                grid.append(button);
            }
            calendar.append(grid);
            const note = document.createElement('p');
            note.textContent = input.value ? `Valgt dato: ${input.value.split('-').reverse().join('.')}` : 'Vælg en hverdag. Weekender kan ikke vælges.';
            note.setAttribute('aria-live', 'polite');
            calendar.append(note);
        }
        input.form?.addEventListener('reset', () => { input.value = ''; render(); input.dispatchEvent(new Event('change', { bubbles: true })); });
        render();
        return calendar;
    }
    window.BookingCalendar = { mount };
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('ønsket_dato');
        if (input) mount(input);
    });
})();
