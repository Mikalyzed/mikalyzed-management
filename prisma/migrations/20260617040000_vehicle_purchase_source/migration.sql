-- Add `purchase_source` column to vehicles. This is the acquisition channel
-- (Auction, Consignment, Private Party, Referral, Repeat, Repo, Trade-In,
-- Wholesale, Other) — distinct from `purchase_type` which captures the
-- financial/legal structure (Purchased, Trade-In, Consignment, Flooring).
-- Both are useful for reporting: source = where the car came from,
-- type = how the dealership owns it.

ALTER TABLE "vehicles"
  ADD COLUMN "purchase_source" TEXT;
