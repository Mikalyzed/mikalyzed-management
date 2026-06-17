-- Extend `contacts` to capture the full Customer record matching the
-- DealerCenter "Add New Customer" form. The existing fields (firstName,
-- lastName, email, phone, secondaryPhone, dateOfBirth, contactType, address,
-- city, state, zip, source, tags, notes) stay; this adds identity + lead +
-- employment + referrer fields used by the AddCustomerModal.
--
-- SSN is stored plain for v1; encryption / column-level security is deferred
-- to the security review phase. Access is gated at the API layer.

ALTER TABLE "contacts"
  ADD COLUMN "gender"               TEXT,
  ADD COLUMN "ssn"                  TEXT,
  ADD COLUMN "id_type"              TEXT,
  ADD COLUMN "id_state"             TEXT,
  ADD COLUMN "id_no"                TEXT,
  ADD COLUMN "id_issued_date"       TIMESTAMP(3),
  ADD COLUMN "id_expiration_date"   TIMESTAMP(3),
  ADD COLUMN "home_phone"           TEXT,
  ADD COLUMN "work_phone"           TEXT,
  ADD COLUMN "lead_type"            TEXT,
  ADD COLUMN "lead_source"          TEXT,
  ADD COLUMN "customer_status"      TEXT,
  ADD COLUMN "cash_down"            DOUBLE PRECISION,
  ADD COLUMN "sales_rep_id"         TEXT,
  ADD COLUMN "is_in_showroom"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "employer_name"        TEXT,
  ADD COLUMN "employer_phone"       TEXT,
  ADD COLUMN "employer_address"     TEXT,
  ADD COLUMN "employer_years"       INTEGER,
  ADD COLUMN "employer_monthly_income" DOUBLE PRECISION,
  ADD COLUMN "referrer_name"        TEXT,
  ADD COLUMN "referrer_contact_id"  TEXT;

CREATE INDEX "contacts_customer_status_idx"  ON "contacts" ("customer_status");
CREATE INDEX "contacts_lead_type_idx"        ON "contacts" ("lead_type");
CREATE INDEX "contacts_sales_rep_id_idx"     ON "contacts" ("sales_rep_id");
CREATE INDEX "contacts_referrer_contact_id_idx" ON "contacts" ("referrer_contact_id");
