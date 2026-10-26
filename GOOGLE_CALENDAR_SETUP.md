# Google Calendar: receiving calendar changes

This branch adds `POST /api/calendar/google/webhook`. Google sends a change notification there; the server fetches busy events from the selected Google calendar and stores only event IDs and start/end times. `/api/availability` blocks overlapping two-hour booking slots. The server also refreshes hourly in case a notification is missed.

## Before connecting

1. Enable **Google Calendar API** in Google Cloud.
2. Create an OAuth client of type **Web application**. The planned redirect URI is `https://www.birgittesbriks.dk/api/calendar/google/callback` (or `http://localhost:3000/api/calendar/google/callback` locally). The OAuth callback is **not yet implemented** in this branch.
3. Obtain a refresh token with Google Calendar events permission, using the OAuth callback in the next integration step. Store the client ID, client secret, and refresh token as private server environment variables. Do not commit them.
4. Set `GOOGLE_CALENDAR_ID` to the ID of the specific calendar selected on the iPhone. Set `GOOGLE_CALENDAR_WEBHOOK_URL` to `https://www.birgittesbriks.dk/api/calendar/google/webhook`.
5. Deploy the schema migration with `npm run db:deploy`.
6. Run `npm run calendar:connect` in the deployed environment. Save the three printed channel values as private server environment variables and restart the service. The command also performs an initial sync.

Google webhook channels expire. Run `npm run calendar:connect` again before the printed expiration and update the channel values. Until automatic renewal is added, the hourly sync continues to catch calendar changes after expiration, with a possible delay of up to an hour.

This branch handles **Google Calendar → availability**. Creating or editing a booking on the website in Google Calendar is a separate step. Online booking is currently disabled in `routes/bookings.js`.
