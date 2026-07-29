-- AlterTable
ALTER TABLE "vehicle_plan_steps" ADD COLUMN     "action_created_at" TIMESTAMP(3),
ADD COLUMN     "action_shop" TEXT,
ADD COLUMN     "action_stage" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generic';

