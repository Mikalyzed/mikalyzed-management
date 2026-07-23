-- DropForeignKey
ALTER TABLE "calls" DROP CONSTRAINT "calls_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "calls" DROP CONSTRAINT "calls_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "connected_instagram_accounts" DROP CONSTRAINT "connected_instagram_accounts_connected_by_id_fkey";

-- DropForeignKey
ALTER TABLE "cost_adds" DROP CONSTRAINT "cost_adds_partner_id_fkey";

-- DropForeignKey
ALTER TABLE "disposition_stage_rules" DROP CONSTRAINT "disposition_stage_rules_current_stage_id_fkey";

-- DropForeignKey
ALTER TABLE "disposition_stage_rules" DROP CONSTRAINT "disposition_stage_rules_disposition_id_fkey";

-- DropForeignKey
ALTER TABLE "disposition_stage_rules" DROP CONSTRAINT "disposition_stage_rules_move_to_stage_id_fkey";

-- DropForeignKey
ALTER TABLE "disposition_stage_rules" DROP CONSTRAINT "disposition_stage_rules_pipeline_id_fkey";

-- DropForeignKey
ALTER TABLE "email_subscriptions" DROP CONSTRAINT "email_subscriptions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "external_repairs" DROP CONSTRAINT "external_repairs_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_links" DROP CONSTRAINT "upload_links_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "upload_links" DROP CONSTRAINT "upload_links_created_by_id_fkey";

-- AlterTable
ALTER TABLE "calls" ALTER COLUMN "started_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "answered_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "ended_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "checklist_templates" DROP CONSTRAINT "checklist_templates_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "disposition_stage_rules" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "email_subscriptions" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "external_repairs" ALTER COLUMN "vendor_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "partners" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "parts" ALTER COLUMN "install_task_created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tasks_board" ALTER COLUMN "stock_numbers" SET NOT NULL;

-- AlterTable
ALTER TABLE "upload_links" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "disposition_stage_rules_pipeline_id_disposition_id_current__key" ON "disposition_stage_rules"("pipeline_id", "disposition_id", "current_stage_id");

-- AddForeignKey
ALTER TABLE "cost_adds" ADD CONSTRAINT "cost_adds_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_repairs" ADD CONSTRAINT "external_repairs_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_subscriptions" ADD CONSTRAINT "email_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_links" ADD CONSTRAINT "upload_links_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_links" ADD CONSTRAINT "upload_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "dispositions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposition_stage_rules" ADD CONSTRAINT "disposition_stage_rules_move_to_stage_id_fkey" FOREIGN KEY ("move_to_stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connected_instagram_accounts" ADD CONSTRAINT "connected_instagram_accounts_connected_by_id_fkey" FOREIGN KEY ("connected_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_calls_contact_started" RENAME TO "calls_contact_id_started_at_idx";

-- RenameIndex
ALTER INDEX "idx_calls_sid" RENAME TO "calls_twilio_call_sid_idx";

-- RenameIndex
ALTER INDEX "idx_dsr_disposition" RENAME TO "disposition_stage_rules_disposition_id_idx";

-- RenameIndex
ALTER INDEX "idx_dsr_pipeline" RENAME TO "disposition_stage_rules_pipeline_id_idx";

-- RenameIndex
ALTER INDEX "idx_email_sub_email" RENAME TO "email_subscriptions_user_email_idx";

-- RenameIndex
ALTER INDEX "idx_email_sub_expires" RENAME TO "email_subscriptions_expires_at_idx";

-- RenameIndex
ALTER INDEX "idx_upload_links_contact" RENAME TO "upload_links_contact_id_idx";

-- RenameIndex
ALTER INDEX "idx_upload_links_token" RENAME TO "upload_links_token_idx";

