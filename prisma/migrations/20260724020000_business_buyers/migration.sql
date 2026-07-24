-- DropForeignKey
ALTER TABLE "deals" DROP CONSTRAINT "deals_buyer_contact_id_fkey";

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "business_buyer_id" TEXT,
ALTER COLUMN "buyer_contact_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "enterprise_type" TEXT,
    "tax_id" TEXT,
    "years_in_business" INTEGER,
    "months_in_business" INTEGER,
    "gross_monthly_income" DOUBLE PRECISION,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "county" TEXT,
    "length_at_address_years" INTEGER,
    "length_at_address_months" INTEGER,
    "mortgage_type" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "type_of_business" TEXT,
    "vehicles_financed" INTEGER,
    "vehicles_owned" INTEGER,
    "aggregate_monthly_pmt" DOUBLE PRECISION,
    "loan_lease" TEXT,
    "operating_lease" TEXT,
    "prior_bankruptcy" TEXT,
    "prior_repossession" TEXT,
    "lawsuit_party" TEXT,
    "delinquent_taxes" TEXT,
    "operator_first_name" TEXT,
    "operator_last_name" TEXT,
    "operator_street" TEXT,
    "operator_city" TEXT,
    "operator_state" TEXT,
    "operator_zip" TEXT,
    "operator_county" TEXT,
    "principal_first_name" TEXT,
    "principal_last_name" TEXT,
    "principal_job_title" TEXT,
    "principal_phone" TEXT,
    "principal_dob" TIMESTAMP(3),
    "principal_ownership_pct" DOUBLE PRECISION,
    "principal_street" TEXT,
    "principal_city" TEXT,
    "principal_state" TEXT,
    "principal_zip" TEXT,
    "principal_county" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "businesses_business_name_idx" ON "businesses"("business_name");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_contact_id_fkey" FOREIGN KEY ("buyer_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_business_buyer_id_fkey" FOREIGN KEY ("business_buyer_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

