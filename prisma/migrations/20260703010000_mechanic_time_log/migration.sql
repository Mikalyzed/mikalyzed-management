-- Per-session mechanic labor log for accurate per-day / per-mechanic hour reporting.
CREATE TABLE "mechanic_time_logs" (
    "id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "work_date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mechanic_time_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mechanic_time_logs_user_id_work_date_idx" ON "mechanic_time_logs"("user_id", "work_date");
CREATE INDEX "mechanic_time_logs_stage_id_idx" ON "mechanic_time_logs"("stage_id");
