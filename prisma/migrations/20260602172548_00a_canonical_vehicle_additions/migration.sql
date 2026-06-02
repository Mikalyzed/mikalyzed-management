-- Phase 0.A — Additive Schema Changes (Vehicle Identity Unification)
-- Strategy A: Vehicle.id is canonical PK; absorb InventoryVehicle scalar fields onto Vehicle.
-- All column additions are NULLable so existing rows remain valid.
-- Postgres metadata-only ops: ADD COLUMN nullable, CREATE TABLE, CREATE INDEX.
-- Only "destructive" ops are DROP COLUMN photos[] on vehicles + vehicle_stages —
-- verified by grep that no code in app/ or lib/ reads or writes these columns.

-- ─────────────────────────────────────────────────────────────────────
-- 1. Absorbed scalar columns on vehicles (all nullable for backward compat)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "vehicles" ADD COLUMN "vehicle_info" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "mileage" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN "location" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "asking_price" DOUBLE PRECISION;
ALTER TABLE "vehicles" ADD COLUMN "vehicle_cost" DOUBLE PRECISION;
ALTER TABLE "vehicles" ADD COLUMN "purchase_type" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "purchased_from" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "purchased_from_vendor_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "title_status" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "date_in_stock" TIMESTAMP(3);
ALTER TABLE "vehicles" ADD COLUMN "inventory_status" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "consignment_commission_pct" DOUBLE PRECISION;

-- ─────────────────────────────────────────────────────────────────────
-- 2. VIN-history self-FK + audit-trail bridges
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "vehicles" ADD COLUMN "prior_vehicle_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "legacy_inventory_vehicle_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "legacy_vehicle_id" TEXT;

-- Self-referential FK for dup-VIN history linking (relation "VehiclePriorHistory")
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_prior_vehicle_id_fkey"
  FOREIGN KEY ("prior_vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Indexes for canonical reader filters + legacy lookups
-- ─────────────────────────────────────────────────────────────────────
CREATE INDEX "vehicles_vin_idx" ON "vehicles"("vin");
CREATE INDEX "vehicles_inventory_status_idx" ON "vehicles"("inventory_status");
CREATE INDEX "vehicles_prior_vehicle_id_idx" ON "vehicles"("prior_vehicle_id");
CREATE INDEX "vehicles_legacy_inventory_vehicle_id_idx" ON "vehicles"("legacy_inventory_vehicle_id");

-- ─────────────────────────────────────────────────────────────────────
-- 4. Drop vestigial photos[] columns (VEH-06 — verified unused by grep)
--    No MediaAsset migration: that is Phase 3 scope.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "vehicles" DROP COLUMN "photos";
ALTER TABLE "vehicle_stages" DROP COLUMN "photos";

-- ─────────────────────────────────────────────────────────────────────
-- 5. New audit table: vehicle_migration_map
--    One row per (oldVehicleId, oldInventoryVehicleId) pair OR per orphan side.
--    Populated by Sub-phase 0.B backfill script. Queried by
--    /api/vehicles/legacy/[oldId] redirect (built Sub-phase 0.C).
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE "vehicle_migration_map" (
    "id" TEXT NOT NULL,
    "old_vehicle_id" TEXT,
    "old_inventory_vehicle_id" TEXT,
    "canonical_vehicle_id" TEXT NOT NULL,
    "match_method" TEXT NOT NULL,
    "match_confidence" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_migration_map_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehicle_migration_map_canonical_vehicle_id_idx"
  ON "vehicle_migration_map"("canonical_vehicle_id");
CREATE INDEX "vehicle_migration_map_old_vehicle_id_idx"
  ON "vehicle_migration_map"("old_vehicle_id");
CREATE INDEX "vehicle_migration_map_old_inventory_vehicle_id_idx"
  ON "vehicle_migration_map"("old_inventory_vehicle_id");
