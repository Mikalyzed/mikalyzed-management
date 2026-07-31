-- AlterTable
ALTER TABLE "external_repairs" ADD COLUMN     "blocked_on_part_id" TEXT;

-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "install_shop" TEXT,
ADD COLUMN     "install_venue" TEXT;

-- CreateIndex
CREATE INDEX "external_repairs_blocked_on_part_id_idx" ON "external_repairs"("blocked_on_part_id");

