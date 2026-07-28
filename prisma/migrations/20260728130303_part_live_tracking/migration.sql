-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "ep_tracker_id" TEXT,
ADD COLUMN     "tracking_carrier" TEXT,
ADD COLUMN     "tracking_status" TEXT,
ADD COLUMN     "tracking_updated_at" TIMESTAMP(3);

