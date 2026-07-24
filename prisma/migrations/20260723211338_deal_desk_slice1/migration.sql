-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "deal_number" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deal_type" TEXT NOT NULL DEFAULT 'retail_cash',
    "vehicle_id" TEXT NOT NULL,
    "buyer_contact_id" TEXT NOT NULL,
    "co_buyer_contact_id" TEXT,
    "opportunity_id" TEXT,
    "sales_rep_id" TEXT,
    "sale_price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "doc_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "title_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "registration_fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_fees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_fees_note" TEXT,
    "collect_tax" BOOLEAN NOT NULL DEFAULT true,
    "state_tax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "county_surtax_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "surtax_cap" DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "tax_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deposit_credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otd_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "funded_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deals_deal_number_key" ON "deals"("deal_number");

-- CreateIndex
CREATE UNIQUE INDEX "deals_opportunity_id_key" ON "deals"("opportunity_id");

-- CreateIndex
CREATE INDEX "deals_vehicle_id_idx" ON "deals"("vehicle_id");

-- CreateIndex
CREATE INDEX "deals_buyer_contact_id_idx" ON "deals"("buyer_contact_id");

-- CreateIndex
CREATE INDEX "deals_status_idx" ON "deals"("status");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_contact_id_fkey" FOREIGN KEY ("buyer_contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_co_buyer_contact_id_fkey" FOREIGN KEY ("co_buyer_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_sales_rep_id_fkey" FOREIGN KEY ("sales_rep_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
