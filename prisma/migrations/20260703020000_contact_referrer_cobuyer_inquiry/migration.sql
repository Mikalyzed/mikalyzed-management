-- Customer/lead fields on Contact: website inquiry type, referrer contact info,
-- and a soft-FK co-buyer link. All nullable + additive.
-- IF NOT EXISTS: these were added to the live DB via `prisma db push` during
-- dev, so this migration is a no-op there and a real add on a fresh database.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "inquiry_type" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "referrer_phone" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "referrer_email" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "referrer_address" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "co_buyer_contact_id" TEXT;
