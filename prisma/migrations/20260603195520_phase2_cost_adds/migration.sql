-- Phase 2 — CostAdd table for itemized vehicle costs
CREATE TABLE "public"."cost_adds" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "receipt_url" TEXT,
    "added_by_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cost_adds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cost_adds_vehicle_id_idx" ON "public"."cost_adds"("vehicle_id");
CREATE INDEX "cost_adds_added_at_idx" ON "public"."cost_adds"("added_at");

ALTER TABLE "public"."cost_adds" ADD CONSTRAINT "cost_adds_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."cost_adds" ADD CONSTRAINT "cost_adds_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
