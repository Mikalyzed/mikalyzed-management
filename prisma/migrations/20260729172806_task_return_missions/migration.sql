-- AlterTable
ALTER TABLE "tasks_board" ADD COLUMN     "mission_type" TEXT,
ADD COLUMN     "self_transport" BOOLEAN NOT NULL DEFAULT false;

