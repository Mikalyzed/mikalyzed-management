-- Add `purchased_from_contact_id` so the Source picker can record when a
-- vehicle was acquired from an INDIVIDUAL (Contact row) rather than a
-- BUSINESS (Partner row). The pair purchased_from_vendor_id +
-- purchased_from_contact_id captures the source side without forcing
-- a unified party table — at most one is non-null per vehicle.

ALTER TABLE "vehicles"
  ADD COLUMN "purchased_from_contact_id" TEXT;

CREATE INDEX "vehicles_purchased_from_contact_id_idx"
  ON "vehicles" ("purchased_from_contact_id");
