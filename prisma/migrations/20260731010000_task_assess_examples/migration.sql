-- CreateTable
CREATE TABLE "task_assess_examples" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assess_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_assess_examples_created_at_idx" ON "task_assess_examples"("created_at");

