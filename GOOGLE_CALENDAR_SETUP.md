# Google Calendar as the booking source

The selected Google calendar contains customer appointments only. Customer availability and the main admin booking list read Google Calendar live. Customers see occupied slots but never other customers' names or notes. A customer sends an email request; that does not reserve a slot. Manual admin bookings create a Google Calendar event. The old `POST /api/bookings` route remains disabled.

The webhook and hourly synchronization keep a minimal local copy of event IDs and times for diagnostics. That copy does not decide customer availability. If Google is unavailable, the availability endpoint returns an error instead of showing unverified free slots.

## Before connecting

1. Enable **Google Calendar API** in Google Cloud.
2. Create an OAuth client of type **Web application**. Set its redirect URI to `https://www.birgittesbriks.dk/api/calendar/google/callback` (or `http://localhost:3000/api/calendar/google/callback` locally). Add the `https://www.googleapis.com/auth/calendar.events` scope and add the intended Google account as a test user.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` as private server environment variables. Generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this key stable: losing it makes the stored refresh token unreadable. Do not commit any of these values.
4. Set `GOOGLE_CALENDAR_ID` to the ID of the specific calendar selected on the iPhone. Set `GOOGLE_CALENDAR_WEBHOOK_URL` to `https://www.birgittesbriks.dk/api/calendar/google/webhook`.
5. Deploy the schema migrations with `npm run db:deploy`. Use a persistent session store (`SESSION_STORE=postgres`) in production so the OAuth state survives between login and callback.
6. Sign in to the website administration and click **Forbind Google Kalender**. Choose a test user that can access the selected calendar. The encrypted refresh token is stored in PostgreSQL and an initial sync is performed.
7. Run `npm run calendar:connect` in the deployed environment. Save the three printed channel values as private server environment variables and restart the service. The command also performs an initial sync.

Google webhook channels expire. Run `npm run calendar:connect` again before the printed expiration and update the channel values. Until automatic renewal is added, the hourly sync continues to catch calendar changes after expiration, with a possible delay of up to an hour.

Existing local booking records are not automatically moved into Google Calendar. Reconcile them before production rollout; otherwise they will not appear in the calendar-based admin list. Cancellation and completion workflows for those older records remain local until reconciliation.

## Local testing

1. Add `http://localhost:3000/api/calendar/google/callback` as an additional authorized redirect URI on the Google OAuth web client.
2. In local `.env`, set `GOOGLE_OAUTH_REDIRECT_URI` to that exact URL, plus `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `DATABASE_URL`. Never commit `.env`.
3. Run `npm install` and start the local PostgreSQL server. This project's existing local database may have no Prisma migration history; in that case `npm run db:deploy` stops with `P3005`. Apply the two calendar SQL migrations with `npx prisma db execute --file prisma/migrations/20261026_google_calendar_events/migration.sql --schema prisma/schema.prisma` and then `npx prisma db execute --file prisma/migrations/20261026_google_calendar_oauth/migration.sql --schema prisma/schema.prisma`. If the existing local database also lacks `bookings.behandling`, apply the older `20260205_add_treatment_betaling_columns`, `20260205_add_users_table`, and `20260407_add_booking_note_default` SQL files in that order with the same `prisma db execute --file ... --schema prisma/schema.prisma` command. Apply each SQL file only once, and only when its schema change is missing.
4. Run `npm run dev`. Open `http://localhost:3000/admin`, log in, and click **Forbind Google Kalender**.
5. The Google webhook cannot call `localhost`. Live customer availability and the admin booking list still work locally without a webhook. Refresh the page after editing the calendar. A public HTTPS tunnel is needed only to test webhook delivery.

Use the Google account that owns or can access `GOOGLE_CALENDAR_ID`. The OAuth scope permits event access across calendars in the authorized Google account, while application code reads only the configured calendar. Keep admin credentials, OAuth client secret, encryption key, and webhook channel token private. The encryption key must not change after connecting, or the stored refresh token cannot be decrypted.
