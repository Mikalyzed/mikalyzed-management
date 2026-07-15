-- Per-mechanic timers on a shared mechanic-stage car, keyed by userId.
-- Additive + nullable: existing rows keep using the stage-level single timer
-- columns (active_seconds / timer_started_at / ...) until a second mechanic is
-- assigned a task on the car.
ALTER TABLE "vehicle_stages" ADD COLUMN "timers" JSONB;
