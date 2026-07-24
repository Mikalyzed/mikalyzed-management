-- AlterTable
ALTER TABLE "deal_line_items" ADD COLUMN     "cost" DOUBLE PRECISION,
ADD COLUMN     "deduct_from" TEXT,
ADD COLUMN     "item_number" TEXT,
ADD COLUMN     "vendor_partner_id" TEXT;

-- AddForeignKey
ALTER TABLE "deal_line_items" ADD CONSTRAINT "deal_line_items_vendor_partner_id_fkey" FOREIGN KEY ("vendor_partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

