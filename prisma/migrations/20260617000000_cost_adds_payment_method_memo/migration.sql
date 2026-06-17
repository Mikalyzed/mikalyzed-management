-- Add `payment_method` and `memo` columns to cost_adds.
-- Both nullable strings; no defaults; safe to apply live.
-- Driving need: the Cost Adds list modal on the vehicle detail page wants to
-- capture how a cost was paid (cash, check, wire, etc.) and an optional free-form
-- memo on top of the structured description. These also feed the future Journal
-- Entries tab + QuickBooks Online sync (Phase 7).

ALTER TABLE "cost_adds"
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "memo" TEXT;
