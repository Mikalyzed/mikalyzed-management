-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "lienholder_partner_id" TEXT;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_lienholder_partner_id_fkey" FOREIGN KEY ("lienholder_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

