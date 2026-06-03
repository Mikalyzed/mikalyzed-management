-- Phase 2 — flooring inline fields on vehicles (lender table + curtailment come later)
ALTER TABLE "public"."vehicles"
  ADD COLUMN "floor_lender"        TEXT,
  ADD COLUMN "floor_principal"     DOUBLE PRECISION,
  ADD COLUMN "floor_daily_rate"    DOUBLE PRECISION,
  ADD COLUMN "floor_advance_date"  TIMESTAMP(3),
  ADD COLUMN "floor_status"        TEXT;
