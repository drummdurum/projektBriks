# Google Calendar: receiving calendar changes

This branch adds `POST /api/calendar/google/webhook`. Google sends a change notification there; the server fetches busy events from the selected Google calendar and stores only event IDs and start/end times. `/api/availability` blocks overlapping two-hour booking slots. The server also refreshes hourly in case a notification is missed.

## Before connecting

1. Enable **Google Calendar API** in Google Cloud.
2. Create an OAuth client of type **Web application**. Set its redirect URI to `https://www.birgittesbriks.dk/api/calendar/google/callback` (or `http://localhost:3000/api/calendar/google/callback` locally). Add the `https://www.googleapis.com/auth/calendar.events` scope and add the intended Google account as a test user.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` as private server environment variables. Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this key stable: losing it makes the stored refresh token unreadable. Do not commit any of these values.
4. Set `GOOGLE_CALENDAR_ID` to the ID of the specific calendar selected on the iPhone. Set `GOOGLE_CALENDAR_WEBHOOK_URL` to `https://www.birgittesbriks.dk/api/calendar/google/webhook`.
5. Deploy the schema migrations with `npm run db:deploy`. Use a persistent session store (`SESSION_STORE=postgres`) in production so the OAuth state survives between login and callback.
6. Sign in to the website administration and click **Forbind Google Kalender**. Choose a test user that can access the selected calendar. The encrypted refresh token is stored in PostgreSQL and an initial sync is performed.
7. Run `npm run calendar:connect` in the deployed environment. Save the three printed channel values as private server environment variables and restart the service. The command also performs an initial sync.

Google webhook channels expire. Run `npm run calendar:connect` again before the printed expiration and update the channel values. Until automatic renewal is added, the hourly sync continues to catch calendar changes after expiration, with a possible delay of up to an hour.

This branch handles **Google Calendar → availability**. Creating or editing a booking on the website in Google Calendar is a separate step. Online booking is currently disabled in `routes/bookings.js`.
