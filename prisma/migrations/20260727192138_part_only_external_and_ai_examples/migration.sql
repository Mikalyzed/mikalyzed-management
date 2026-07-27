-- AlterTable
ALTER TABLE "external_repairs" ADD COLUMN     "part_only" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "meeting_plan_examples" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_plan_examples_pkey" PRIMARY KEY ("id")
);

