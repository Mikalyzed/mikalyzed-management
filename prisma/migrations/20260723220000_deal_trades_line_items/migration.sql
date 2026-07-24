-- AlterTable
ALTER TABLE "deals" DROP COLUMN "doc_fee",
DROP COLUMN "other_fees",
DROP COLUMN "other_fees_note",
DROP COLUMN "registration_fee",
DROP COLUMN "title_fee";

-- CreateTable
CREATE TABLE "deal_line_items" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "deal_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_trades" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "vin" TEXT,
    "year" INTEGER,
    "make" TEXT,
    "model" TEXT,
    "trim" TEXT,
    "mileage" INTEGER,
    "color" TEXT,
    "allowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payoff" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lienholder" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_line_items_deal_id_idx" ON "deal_line_items"("deal_id");

-- CreateIndex
CREATE INDEX "deal_trades_deal_id_idx" ON "deal_trades"("deal_id");

-- AddForeignKey
ALTER TABLE "deal_line_items" ADD CONSTRAINT "deal_line_items_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_trades" ADD CONSTRAINT "deal_trades_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

