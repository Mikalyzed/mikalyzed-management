-- Partners table — business entities the dealership works with (vendors,
-- lenders, lienholders, insurance, etc.). One partner can carry multiple
-- categories (e.g. a finance company that's both a Lender and a Lienholder).
-- Mirrors the DealerCenter "Add New Partner" surface: a categories pill row,
-- General Info / Contact Info / Shipping Info sections.

CREATE TABLE "partners" (
  "id"                          TEXT PRIMARY KEY,
  "categories"                  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- General Info
  "company_name"                TEXT NOT NULL,
  "company_alias"               TEXT,
  "dealer_no"                   TEXT,
  "phone"                       TEXT,
  "phone_alternative"           TEXT,
  "fax"                         TEXT,
  "license_no"                  TEXT,
  "ein"                         TEXT,
  "sales_tax_license"           TEXT,
  "lien_code"                   TEXT,

  -- Contact Info (primary embedded contact person at the company)
  "contact_name"                TEXT,
  "contact_phone"               TEXT,
  "contact_cell"                TEXT,
  "contact_address"             TEXT,
  "contact_email"               TEXT,
  "contact_loss_payee_address"  TEXT,
  "contact_alias"               TEXT,

  -- Shipping Info
  "shipping_name"               TEXT,
  "shipping_business_phone"     TEXT,
  "shipping_address"            TEXT,

  -- Lifecycle
  "is_active"                   BOOLEAN NOT NULL DEFAULT true,
  "archived_at"                 TIMESTAMP(3),
  "created_by_id"               TEXT,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "partners_company_name_idx" ON "partners" ("company_name");
CREATE INDEX "partners_categories_idx" ON "partners" USING GIN ("categories");
CREATE INDEX "partners_archived_at_idx" ON "partners" ("archived_at");

-- Wire cost_adds → partners (nullable, ON DELETE SET NULL so removing a
-- partner doesn't destroy historical cost adds).
ALTER TABLE "cost_adds" ADD COLUMN "partner_id" TEXT;
CREATE INDEX "cost_adds_partner_id_idx" ON "cost_adds" ("partner_id");

ALTER TABLE "cost_adds" ADD CONSTRAINT "cost_adds_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL;
