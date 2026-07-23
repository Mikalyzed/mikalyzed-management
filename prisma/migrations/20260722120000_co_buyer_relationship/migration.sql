-- Relationship of the co-buyer to this buyer (Spouse / Parent / ...).
-- NOTE: originally applied to the live DB via direct SQL on 2026-07-22
-- (prisma migrate dev was blocked by a checksum mismatch at the time);
-- this file backfills the migration history. IF NOT EXISTS keeps it a
-- no-op there while still creating the column on fresh replays.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "co_buyer_relationship" TEXT;
