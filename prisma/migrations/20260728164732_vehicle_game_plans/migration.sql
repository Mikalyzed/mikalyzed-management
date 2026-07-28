-- CreateTable
CREATE TABLE "vehicle_plans" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "goal" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_plan_steps" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "activated_at" TIMESTAMP(3),
    "done_at" TIMESTAMP(3),

    CONSTRAINT "vehicle_plan_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_plans_vehicle_id_key" ON "vehicle_plans"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_plan_steps_plan_id_idx" ON "vehicle_plan_steps"("plan_id");

-- AddForeignKey
ALTER TABLE "vehicle_plans" ADD CONSTRAINT "vehicle_plans_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_plan_steps" ADD CONSTRAINT "vehicle_plan_steps_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "vehicle_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

