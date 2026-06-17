-- New table: cost_add_categories
-- Same pattern as cost_add_descriptions — admin-managed quick-pick list, anyone
-- can free-type, soft-delete via archived_at. Seeded with the existing 7 kinds
-- (Recon, Parts, Transport, Detail, Pack, Acquisition Fee, Other) so existing
-- cost_adds.kind values still match a dropdown entry.

CREATE TABLE "cost_add_categories" (
  "id"            TEXT        PRIMARY KEY,
  "name"          TEXT        NOT NULL,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"   TIMESTAMP(3)
);

CREATE UNIQUE INDEX "cost_add_categories_name_key" ON "cost_add_categories" ("name");
CREATE INDEX "cost_add_categories_archived_at_idx" ON "cost_add_categories" ("archived_at");

-- Seed with the existing 7 kinds (preserve backward compat — every existing
-- cost_adds.kind value still maps to a visible dropdown option).
INSERT INTO "cost_add_categories" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Recon'),
  (gen_random_uuid()::text, 'Parts'),
  (gen_random_uuid()::text, 'Transport'),
  (gen_random_uuid()::text, 'Detail'),
  (gen_random_uuid()::text, 'Pack'),
  (gen_random_uuid()::text, 'Acquisition Fee'),
  (gen_random_uuid()::text, 'Other');
