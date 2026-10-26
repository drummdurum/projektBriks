CREATE TABLE "google_calendar_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "start_time" TIMESTAMP(3) NOT NULL,
  "end_time" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "google_calendar_events_start_time_end_time_idx"
  ON "google_calendar_events"("start_time", "end_time");
