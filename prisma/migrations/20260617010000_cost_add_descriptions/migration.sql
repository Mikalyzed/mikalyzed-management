-- New table: cost_add_descriptions
-- Holds the dealership-wide list of common Cost Add descriptions. Admins manage
-- the list; any user can free-type any description on a cost add (the dropdown
-- is purely a quick-pick aid). archived_at is a soft-delete column so an admin
-- can remove an obsolete option without losing historical references.

CREATE TABLE "cost_add_descriptions" (
  "id"              TEXT        PRIMARY KEY,
  "name"            TEXT        NOT NULL,
  "created_by_id"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at"     TIMESTAMP(3)
);

CREATE UNIQUE INDEX "cost_add_descriptions_name_key" ON "cost_add_descriptions" ("name");
CREATE INDEX "cost_add_descriptions_archived_at_idx" ON "cost_add_descriptions" ("archived_at");

-- Seed the 7 starter options.
INSERT INTO "cost_add_descriptions" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Auction Fee'),
  (gen_random_uuid()::text, 'Broker Fee'),
  (gen_random_uuid()::text, 'Detailing'),
  (gen_random_uuid()::text, 'Repairs & Maintenance'),
  (gen_random_uuid()::text, 'Title Fee'),
  (gen_random_uuid()::text, 'Transportation'),
  (gen_random_uuid()::text, 'Wire Transfer Fee');
