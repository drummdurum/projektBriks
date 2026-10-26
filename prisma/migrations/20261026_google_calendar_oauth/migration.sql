CREATE TABLE "google_calendar_connection" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "encrypted_refresh_token" TEXT NOT NULL,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
