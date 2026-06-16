# Roadmap: Mikalyzed DMS

## Overview

A ten-phase plan to replace DealerCenter for Mikalyzed by layering a full Dealer Management System onto the existing Next.js 15 + Prisma 6 + Postgres production app. The journey starts with a hard gate — collapsing two disconnected vehicle identities into one canonical record (Phase 0) — then lays cross-cutting infra (RBAC + background jobs + storage consolidation in Phases 1a/1b), builds the inventory/media/deal/document/credit/QBO/reporting features that replace DealerCenter (Phases 2–8), and ends with a controlled cutover (Phase 9). Every phase ships behind feature flags in 1–2 week sub-deliverables; compliance-sensitive phases (5 docs/e-sign and 6 credit) require attorney sign-off before flag-on in production.

## Phases

**Phase Numbering:**
- Phases 0–9 represent planned milestone work
- Phases 1a/1b are cross-cutting infra (shipped sequentially; both required before Phase 4)
- Decimal phases (e.g., 2.1) would represent urgent post-planning insertions

Phase 0 is a **hard gate** — no later phase begins until 0.E (decommission) is green.

- [ ] **Phase 0: Vehicle Identity Unification** — Collapse `Vehicle` and `InventoryVehicle` into one canonical record per physical car (HARD GATE)
- [ ] **Phase 1a: RBAC Upgrade** — Permission tables + `requireCan` helper coexisting with existing `requireRole`
- [ ] **Phase 1b: Background Jobs Scaffold + Storage Consolidation** — `Job`/`JobAttempt` tables, Vercel Cron runner, drop Supabase storage, staging Postgres
- [ ] **Phase 2: Inventory Core** — CostAdd, flooring accrual, VIN intake, vendor sourcing, vehicle ActivityLog timeline
- [ ] **Phase 3: Media System + Marketing Syndication** — Typed MediaAsset replacing `photos[]`, sales send-content popup, channel push
- [ ] **Phase 4: Deal Desk** — `Deal` model + state machine + FL tax/fee math + trade-ins + worksheet UI; customer promotion as side-effect of `transitionDeal(funded)`
- [ ] **Phase 5: Documents + E-Signature** — pdf-lib prefill, FL retail packet, embedded BoldSign/Anvil signing, DealSnapshot at signing
- [ ] **Phase 6: Credit Applications** — 700Credit/eLEND adapter, separate CreditAccessLog, no local SSN/DOB, consent-gated hard pulls
- [ ] **Phase 7: QuickBooks Online Sync** — Push-primary on funded deals + daily reconcile, semantic account mapping
- [ ] **Phase 8: Reporting + AI Reporting** — Canned reports library, AskAI extension over DMS data model, weekly digest, audit packet export
- [ ] **Phase 9: Cutover & Go-Live** — Dual-entry cap, historical import, operator runbook, compliance sign-off

## Notes for User Confirmation

Three items surfaced during research that require explicit user confirmation before or at phase kickoff. They are encoded in this roadmap with the research recommendation as the default; flag here if you want them reversed.

1. **Phase 0 strategy disagreement with PROJECT.md.** PROJECT.md Key Decisions table proposes promoting `InventoryVehicle` as the canonical PK. ARCHITECTURE.md and PITFALLS.md both recommend keeping `Vehicle.id` as canonical and absorbing `InventoryVehicle` scalar fields onto it (Strategy A). Reason: `Vehicle.id` is referenced from 6+ tables (`VehicleStage`, `Part`, `TransportRequest`, `CalendarItem`, `Opportunity`, `VehicleInterest`); `InventoryVehicle.id` is referenced from zero. Strategy A is ~4x safer (additive scalar columns, zero FK repointing) and preserves correct `Opportunity` attribution without touching that table. **This roadmap encodes Strategy A.** REQ VEH-01 wording aligns. Confirm before Phase 0 planning starts.

2. **Provider locking is a Phase entry prerequisite.** Phase 5 must lock BoldSign vs Anvil at start. Phase 6 must lock 700Credit vs eLEND at start. Both providers should be applied to in parallel during Phase 0/1 so onboarding lead time doesn't block Phases 5/6. Surfacing here, not buried in phase notes.

3. **Compliance review = hard gate on Phases 5 and 6.** Attorney review on ESIGN consent language, FL retail packet, doc-fee disclosure, HSMV form requirements (Phase 5) and FCRA permissible-purpose flow, GLBA privacy notice, adverse-action template + timeline (Phase 6) must be in writing in `.planning/` before the feature flag flips on in production. Built into Phase 5/6 success criteria.

## Solo-Dev Pacing Constraint

Every phase ships in sub-phases of 1–2 weeks each, behind feature flags, until full phase scope is complete. If a sub-phase hits week 3 without shipping, scope is cut. Phase 0 is the exception — it cannot ship partially; allocate extra calendar time and resist scope additions.

## Phase Details

### Phase 0: Vehicle Identity Unification
**Goal**: One canonical `Vehicle` row per physical car, with `Vehicle.id` retained as canonical PK and `InventoryVehicle` scalar fields absorbed. Sales attribution remains correct without touching `Opportunity`. Recon flow continues unchanged. `InventoryVehicle` decommissioned after 30-day audit window.
**Depends on**: Nothing (first phase, hard gate)
**Requirements**: VEH-01, VEH-02, VEH-03, VEH-04, VEH-05, VEH-06, VEH-07, VEH-08, VEH-09
**Success Criteria** (what must be TRUE):
  1. Every physical car in production has exactly one canonical `Vehicle` row containing both recon fields (stages, parts, photos source) and former `InventoryVehicle` scalars (cost, price, purchaseType, titleStatus, dateInStock, etc.)
  2. Recon workflow (stage transitions, parts, checklists, mechanic board, TV board, notifications) functions identically to pre-migration behavior — verified by a user-walked smoke test across all stages
  3. `Opportunity.vehicleId` resolves correctly to the canonical `Vehicle` with no FK repointing required (Strategy A invariant) — sales attribution numbers match pre-migration baselines for any closed date range
  4. `VehicleMigrationMap` table preserves every old `Vehicle.id` ↔ old `InventoryVehicle.id` ↔ canonical-id mapping with `matchMethod` and `matchConfidence`; legacy ID redirect endpoint `/api/vehicles/legacy/:oldId` returns 301 to canonical for 90 days
  5. Backfill executed and verified idempotent on a Supabase preview-branch clone; rollback rehearsed on production data copy with database snapshot in hand before live cutover; iOS Capacitor build with new ID resolution logic shipped to TestFlight pre-cutover
**Plans**: 5 sub-phases — 00-01 (0.A additive schema, **code-complete 2026-06-02, awaiting prod migration apply**), 00-02 (0.B idempotent backfill), 00-03 (0.C dual-write window), 00-04 (0.D reader cutover), 00-05 (0.E decommission)

### Phase 1a: RBAC Upgrade
**Goal**: New permission model (`Permission` + `RolePermission` + `UserPermission` tables) coexisting with existing `requireRole` helper, with `requireCan(userId, key)` callable from every new DMS API route. Admin role bypasses all checks. Existing role enum preserved.
**Depends on**: Phase 0
**Requirements**: RBAC-01, RBAC-02, RBAC-03, RBAC-04, RBAC-05
**Success Criteria** (what must be TRUE):
  1. Seeded permission keys follow `<module>.<action>` convention (e.g., `credit.run_hard`, `deal.fund`, `document.send_to_sign`); admin user gets all permissions automatically
  2. `requireCan(userId, 'credit.run_hard')` returns/throws correctly based on combined role + per-user permissions; existing `requireRole` callsites continue to work unmodified
  3. Every new DMS API route in this and later phases enforces `requireCan(...)` for the same key the UI checks (no UI-only enforcement)
  4. `UserPermission` overrides are additive only — they grant extra permissions but cannot revoke role-implied ones; admin override is logged to ActivityLog when granted

### Phase 1b: Background Jobs Scaffold + Storage Consolidation
**Goal**: DB-backed job queue (`Job` + `JobAttempt`) with Vercel Cron runner every 1 minute using `FOR UPDATE SKIP LOCKED`, typed handler dispatch in `lib/dms/jobs/handlers/`, exponential backoff + dead-letter on failure. Supabase storage audited and migrated/deprecated to R2. Separate staging Postgres wired to Vercel preview deployments for any phase touching credit/deals/documents.
**Depends on**: Phase 0
**Requirements**: JOB-01, JOB-02, JOB-03, JOB-04, JOB-05, JOB-06
**Success Criteria** (what must be TRUE):
  1. Submitting a `Job(type='test.echo', payload={...})` row results in it being claimed within 60 seconds by the cron runner, dispatched to the typed handler, and transitioned to `completed` with a `JobAttempt` row recording start/finish/status
  2. A handler that throws three times in a row results in exponential-backoff retries up to `maxAttempts`, then `status='dead_letter'` and an `ActivityLog` row surfacing the failure; ops dashboard lists stuck/dead-lettered jobs
  3. Two concurrent runner invocations never claim the same `Job` row (verified by synthetic load test on staging); `FOR UPDATE SKIP LOCKED` semantics confirmed
  4. All new code paths write files only to R2; `grep -r 'supabase.storage'` in `lib/` and `app/` returns zero new callsites; any pre-existing Supabase storage usage is migrated to R2 or explicitly deprecated in place with no new writes
  5. Vercel preview deployments connect to a separate Supabase project (not production DB); environment-aware code refuses to call live credit/e-sign provider endpoints in non-prod

### Phase 2: Inventory Core
**Goal**: Itemized cost-build-up per vehicle with receipts and actor attribution, daily flooring interest accrual (filtered hard to PURCHASED units only), VIN intake via vPIC + paid provider, vendor sourcing via `Contact(contactType=vendor)` or extended `Vendor` model, full ActivityLog timeline surfaced on vehicle detail page, inventory aging buckets with cost-to-keep-per-day, flooring exposure dashboard, do-not-sell hold flag.
**Depends on**: Phase 0, Phase 1a, Phase 1b (flooring accrual is a scheduled job)
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09, INV-10, INV-11, INV-12
**Success Criteria** (what must be TRUE):
  1. User can add a `CostAdd` (kind, amount, optional vendor, receipt upload, description) to any vehicle; the vehicle's computed true-cost reflects the addition immediately and an `ActivityLog` entry captures actor + amount + kind
  2. VIN intake on a new vehicle returns vPIC baseline fields automatically; paid-provider trim/options fields populate when configured; both responses are cached indefinitely keyed by VIN
  3. Daily flooring accrual job runs at scheduled time and creates `CostAdd(kind=flooring_interest)` entries only for vehicles with `purchaseType=PURCHASED AND flooringStatus=active` — verified by synthetic consignment + paid-off test vehicles that show zero accrual entries
  4. Vehicle detail page surfaces a unified ActivityLog timeline (costs, photos, status changes, messages, deals) ordered by timestamp with actor visible
  5. Inventory list shows aging buckets (0-30 / 31-60 / 61-90 / 90+) computed from acquisition date with cost-to-keep-per-day per unit; flooring exposure dashboard sums outstanding principal + accrued interest by lender; do-not-sell flag gates marketing syndication and blocks deal-desk entry

### Phase 3: Media System + Marketing Syndication
**Goal**: Typed `MediaAsset` model (exterior/interior/undercarriage/walkaround_video/turntable_video/doc) with ordering, replacing `Vehicle.photos[]`. Walkaround + turntable video upload via existing UploadLink + multipart S3/R2 pipeline. Sales-side "Send content" popup produces shareable link in two clicks. Stale-media flag surfaces on inventory list. Marketing channel syndication (`MarketingPlacement` per channel) with per-channel pending/synced/error status; one-screen push of price + photos + status.
**Depends on**: Phase 0 (canonical Vehicle), Phase 1a (RBAC)
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05
**Success Criteria** (what must be TRUE):
  1. All existing `Vehicle.photos[]` data is migrated into `MediaAsset` rows (default `type=exterior`, order = array index); legacy `photos[]` column readable for 30 days as fallback then dropped
  2. A salesperson can open the "Send content" popup on any vehicle, pick a typed subset of media, and produce a shareable link in two clicks; the recipient sees an ordered gallery on a public token URL
  3. Walkaround and turntable video upload completes via multipart S3/R2 for files >100MB; web-optimized derivatives generated via sharp and surfaced in galleries
  4. Inventory list shows a "stale media" flag for vehicles front-line for N+ days with no new media since front-line-ready date; content team's queue surfaces the same list
  5. From a vehicle's marketing-syndication screen, the user pushes price + photos + status to configured channels in one click; per-channel `MarketingPlacement` rows show pending/synced/error states with retry on error

### Phase 4: Deal Desk
**Goal**: Complete deal-desk capability — `Deal` model + state machine, FL retail math (state tax + county surtax with cap + sourcing rule), doc fee handling, trade-in workflow (allowance vs payoff with good-through), GAP/VSC, deposit, deal-type discriminator (retail_cash / retail_outside_financed / wholesale / consignment_payout), gross-profit calc, consignment commission, flooring payoff at funding, deal unwind workflow, live OTD worksheet UI, customer-facing share link. Customer promotion (lead → customer) is a side-effect of `transitionDeal(funded)`, not a separate phase.
**Depends on**: Phase 0 (canonical Vehicle), Phase 1a (RBAC), Phase 1b (jobs for QBO push enqueue), Phase 2 (CostAdd for gross calc)
**Requirements**: CUST-01, DEAL-01, DEAL-02, DEAL-03, DEAL-04, DEAL-05, DEAL-06, DEAL-07, DEAL-08, DEAL-09, DEAL-10, DEAL-11, DEAL-12, DEAL-13, DEAL-14, DEAL-15
**Success Criteria** (what must be TRUE):
  1. Operator can create a retail cash deal from a won Opportunity via explicit "Create Deal" action; the resulting `Deal` is in `draft` state with `opportunityId` set and `Opportunity.dealId` back-pointer maintained; the Opportunity does NOT auto-move to "won" until the deal reaches `funded`
  2. The live worksheet computes FL state tax + county surtax correctly on a representative deal — taxable base honors `flDocFeeTaxable` config, trade allowance reduces taxable base (clamped at zero, never negative), surtax applies only to first `surtaxCap` of base, government fees excluded from taxable base, all money in integer cents — and the breakdown is visible line-by-line in the UI
  3. Deal state machine refuses illegal transitions; every transition goes through `transitionDeal(id, to, actor)` which writes `DealStateTransition` + `ActivityLog` inside one Prisma transaction; on `funded`, `Contact.contactType` flips lead → customer, `Vehicle.status` moves to sold, flooring units have final accrual computed and `flooringStatus` → paid_off
  4. Deal unwind workflow reverses inventory state (vehicle back to available), marks the deal `unwound` with reason, and enqueues QBO reversal jobs; voided deals reverse consignment commission; gross profit (front = sale price − bookedCost − over-allowance, back = GAP + VSC profit) is computed and stored on funded deals
  5. Per-county surtax rate is sourced from buyer's county of residence (override + reason supported); `FLCountySurtaxRate` table with `effectiveDate` ensures historical deals retain their period's rate; deal templates (FL retail cash / outside-financed / wholesale / consignment / out-of-state) preconfigure required fees, doc set, and tax behavior

**Compliance prerequisite (entry gate):** Accountant call to confirm FL surtax cap, doc-fee taxable status, trade-in credit treatment, sourcing rule, and dealer/government fee classifications — confirmation documented in `.planning/` before encoding rates.

### Phase 5: Documents + E-Signature
**Goal**: Versioned `DocumentTemplate` registry, `pdf-lib` prefill for complete FL retail packet, embedded signing via locked provider (BoldSign OR Anvil) with `SigningSession` + webhook idempotency, signed PDF + audit certificate stored in R2, per-deal-type packet bundling with `RequiredFormSet` pre-flight gate, `DealSnapshot` freezes deal values at signing, files tab on vehicle for non-deal documents (titles/receipts/registrations), customer-facing read-only OTD share link.
**Depends on**: Phase 0 (canonical Vehicle), Phase 1a (RBAC), Phase 1b (jobs for `esign.fetch_signed_artifacts`), Phase 4 (Deal model)
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06, DOC-07, DOC-08, DOC-09, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14
**Success Criteria** (what must be TRUE):
  1. User generates a full FL retail packet on a funded-ready deal — purchase agreement, deposit, bill of sale, FTC Buyers Guide + as-is, federal odometer disclosure, HSMV forms, POA, GLBA privacy notice, doc-fee disclosure — and the "Send for Signature" button is disabled until every required form per the deal's `RequiredFormSet` is present in the packet
  2. Embedded signing happens in an iframe on `/deals/[id]/sign`; the provider's out-of-the-box ESIGN/UETA consent screen is shown unmodified; after customer signs, the webhook handler verifies HMAC + idempotency-checks event_id, enqueues `esign.fetch_signed_artifacts` job, and on job completion stores signed PDF + audit certificate in R2 with pre-signature SHA-256 hash verified
  3. When all required Documents on a Deal reach `signed` state, the Deal auto-transitions to `documents_signed`; a `DealSnapshot` row is created freezing every field used on the PDFs (tax, fees, vehicle data, customer data) so signed-state deal UI reads from snapshot, never recomputed live values
  4. Voided deals mark attached signed documents `voided` (status only, never deletion); signed PDFs retained per FL dealer recordkeeping period; customer can review read-only OTD breakdown at `app/u/[token]` share link before signing
  5. Attorney review on ESIGN consent language, Buyers Guide language (English + Spanish where required), doc-fee disclosure, HSMV field requirements, adverse-action template language is documented in writing in `.planning/` before the Phase 5 feature flag is enabled in production

**Compliance prerequisite (entry gate):** Provider locked (BoldSign vs Anvil) at start of phase with current pricing/embedded-signing API parity verified. HSMV PDF audit (AcroForm vs XFA) completed once before encoding. Attorney review scheduled as milestone deliverable.

### Phase 6: Credit Applications
**Goal**: `CreditApplication` + `CreditPull` + separate `CreditAccessLog` (GLBA-grade, write-only, tamper-evident) — no SSN/DOB columns anywhere in DMS schema. Provider adapter (700Credit OR eLEND, locked at start). Soft-pull prequal flow via public link with consent capture; hard pull on real deals gated by `consentSigned` document (403 otherwise). `creditService.viewWithAudit` chokepoint for every credit-data read. Adverse-action notice tracking with SLA monitor. Red Flags + OFAC surfacing. `permittedDealIds[]` allowlist preventing stale-pull reuse.
**Depends on**: Phase 0, Phase 1a (RBAC permission keys for credit), Phase 1b (jobs for status polling + adverse-action delivery confirmation), Phase 4 (Deal model), Phase 5 (FCRA consent itself is a signed document)
**Requirements**: CRED-01, CRED-02, CRED-03, CRED-04, CRED-05, CRED-06, CRED-07, CRED-08, CRED-09, CRED-10, CRED-11, CRED-12, CRED-13
**Success Criteria** (what must be TRUE):
  1. Credit application form submits SSN/DOB directly to the provider's iframe or API endpoint — the request body never traverses the Next.js server; PR review on Phase 6 confirms zero SSN/DOB columns in Prisma schema and `/api/credit-*` endpoints have log scrubbing
  2. Soft-pull prequal flow available via public customer link (`app/u/[token]`) with consent capture; sends `lead → qualified_lead` signal on success; hard-pull endpoint returns 403 unless `CreditApplication.consentSigned` document is on file dated before the pull
  3. Every read of `CreditPull` or `CreditApplication` data goes through `creditService.viewWithAudit(pullId, accessType, user, req)` which writes a `CreditAccessLog` row (actorId, accessType, IP, userAgent) before returning data; direct `prisma.creditPull.findMany` outside `lib/dms/credit/` is forbidden by code-review convention
  4. On denied pulls, a pending `AdverseActionNotice` task is created with SLA timer (per attorney-confirmed ECOA/FCRA window); delivery confirmation captured in ActivityLog; Red Flags + OFAC hits surface in deal UI requiring explicit user review with reason logged before deal can proceed
  5. Provider sandbox + synthetic test SSNs are wired before any Phase 6 code runs against real data; non-prod environment refuses to call live credit endpoints; `CreditPull.permittedDealIds[]` prevents stale-pull reuse; attorney review on FCRA permissible-purpose flow, GLBA privacy notice, adverse-action template + timeline documented in writing in `.planning/` before Phase 6 feature flag flips on in production

**Compliance prerequisite (entry gate):** Provider locked (700Credit vs eLEND) at start of phase with onboarding completed. Attorney review scheduled as milestone deliverable. Both providers should have been applied to during Phase 0/1 to avoid onboarding blocking the phase.

### Phase 7: QuickBooks Online Sync
**Goal**: One-way push from DMS → QBO on funded deals, cost adds, flooring payoffs. `intuit-oauth` token management with refresh-on-every-refresh discipline. `AccountingMapping` configuration table — semantic keys (e.g., `sales_tax_state_payable`, `cogs_used_vehicles`) → QBO account IDs, referenced everywhere; no raw IDs hardcoded. `QboSyncRecord` with idempotency hash. Multi-line journal entries with sum-of-lines = deal-total cents asserted before send. Reversing entries on void/unwind (originals never deleted). WIP→COGS transfer at deal close. Daily reconcile cron flagging mismatches in `QboReconciliationFlag`. Admin "stuck syncs" page with manual retry + override + skip-with-reason.
**Depends on**: Phase 1b (jobs scaffold), Phase 2 (CostAdd), Phase 4 (Deal model)
**Requirements**: QBO-01, QBO-02, QBO-03, QBO-04, QBO-05, QBO-06, QBO-07, QBO-08, QBO-09, QBO-10, QBO-11, QBO-12
**Success Criteria** (what must be TRUE):
  1. Funded retail deal results in a multi-line journal entry pushed to QBO containing Cash/AR, COGS, Vehicle Inventory CR, Sales Revenue, Sales Tax Payable (state and county as separate accounts), Doc Fee Income, etc.; sum of lines = deal total in cents asserted before send; failure to balance rejects the sync, no partial push
  2. CostAdd creates a QBO Bill posted to a Work-In-Process inventory account; on deal funding, the deal close transfers WIP balance to COGS for that vehicle — period-matched with revenue; trade-in acquisition entries (DR Vehicle Inventory, CR Customer Deposit or Sales Discount for over-allowance) handled per accountant convention
  3. Voided/unwound deals push reversing entries that reference the original by ID; originals are never deleted; flooring payoff entry on funded deal posts DR Flooring Liability / CR Cash; GAP/VSC F&I entries use separate income and COGS accounts
  4. Daily reconcile job at 2am pulls QBO entities updated last 24h and flags mismatches in `QboReconciliationFlag` (e.g., DMS says synced but QBO returns 404); admin "stuck syncs" page lists failed/dead-lettered syncs with manual retry, override, and skip-with-reason buttons; refresh-token-within-7-days-of-expiry email alert sent to admin
  5. `QboSyncRecord` is unique on (entityType, entityId) — re-pushing the same deal/cost-add is a no-op via `payloadHash` short-circuit; all account IDs live in `AccountingMapping`, sync code references semantic keys only, never raw QBO IDs

**Compliance prerequisite (entry gate):** Accountant call to define chart-of-accounts mapping (semantic key → QBO account ID per Mikalyzed's books); produces the `AccountingMapping` seed data before code starts.

### Phase 8: Reporting + AI Reporting
**Goal**: Canned report library covering inventory aging (with cost-to-keep), front-line readiness, gross by unit/source, sales by rep, flooring exposure, days-to-sell distribution, deal lifecycle / close rate, F&I penetration, tax liability snapshot, unwound deals, audit/CreditAccessLog filtered views. Extended `AskAI` with tool-use schemas for the canonical DMS data model — natural-language ad-hoc reports across deals/inventory/contacts/cost/credit (within RBAC permission scope). AI queries promotable to saved canned reports. Anomaly alerts (rule-based detection + AI summary). Weekly digest auto-emailed Mon AM. Audit packet export (date-range zip of deals + signed docs + activity logs + credit-access logs). Drill-down navigation report → vehicle → activity log → deal/message.
**Depends on**: Phases 2–7 (data model must exist in canonical shape)
**Requirements**: REP-01, REP-02, REP-03, REP-04, REP-05, REP-06, REP-07
**Success Criteria** (what must be TRUE):
  1. User opens the canned report library and runs inventory aging — every active vehicle appears in its correct aging bucket (0-30/31-60/61-90/90+) with cost-to-keep-per-day and total carry-to-date; drilling into a unit navigates to its detail page with full ActivityLog timeline
  2. User asks AskAI "show me all cars over 60 days with no new media in the last 30 days and gross under $1500 on the last comparable sale" — the system returns a structured result respecting the asker's RBAC permission scope (e.g., sales rep can't see units in another rep's pipeline if RBAC says so)
  3. AI-generated query can be promoted to a saved canned report (named, parameters preserved, re-runnable); anomaly alerts surface rule-based detections (re-photographed 5+ times, doc fee below standard, cost add 3× vendor avg) with AI summary
  4. Weekly digest auto-emails Mon AM to opted-in admin users summarizing prior week's gross, units, aging changes, flooring exposure, anomalies; audit packet export given a date range produces a downloadable zip containing all funded deals + signed documents + activity logs + credit-access logs as compliance evidence
  5. End-to-end drill-down works: a flagged anomaly in the digest → click → report row → vehicle detail → activity log → specific deal or message that explains the gap

### Phase 9: Cutover & Go-Live
**Goal**: Dual-entry period capped at ≤2 weeks with daily reconciliation showing <5% delta for 5 consecutive business days before cutover. DealerCenter goes read-only on pre-announced date and stays read-only for 90 days then archived. Open DealerCenter deals at cutover complete in DealerCenter (no mid-deal migration); new deals start in DMS only. Read-only historical import of DealerCenter deals for prior 24 months loads into DMS marked `source=dealercenter_import`. Operator runbook documents: deploy rollback, Vercel log reading, feature-flag toggle, manual data correction procedure, compliance-incident response, on-call escalation. Per-phase compliance review sign-off documented (Phase 5 docs + Phase 6 credit) before respective feature flags enabled in production.
**Depends on**: Phases 2 + 4 + 5 + 7 live in production minimum (inventory + deals + docs + accounting); Phase 6 + 8 strongly recommended live but not strictly blocking
**Requirements**: CUT-01, CUT-02, CUT-03, CUT-04, CUT-05, CUT-06
**Success Criteria** (what must be TRUE):
  1. Daily reconciliation report comparing DMS and DealerCenter for the dual-entry window shows <5% delta on key metrics (gross, units, sales tax, F&I) for 5 consecutive business days; cutover date is announced in advance and DealerCenter is read-only after that date
  2. Open DealerCenter deals at cutover complete in DealerCenter (none migrated mid-deal); new deals start in DMS only; the operator can clearly see which historical records came from `dealercenter_import` and filter reports to include/exclude them
  3. Historical import of prior 24 months of DealerCenter deals is loaded read-only into DMS with `source=dealercenter_import`; imported records do not trigger workflow side effects (no commissions accrued, no notifications fired) and are excluded from "active" metrics by default
  4. Operator runbook exists in `.planning/` covering deploy rollback steps, how to read Vercel logs, how to toggle each major feature flag, manual data correction procedure for common cases, compliance-incident response, on-call escalation contacts
  5. Written compliance sign-off (attorney email + saved to `.planning/`) on file for Phase 5 e-signature flow and Phase 6 credit flow before respective feature flags are enabled in production; DealerCenter cancellation date is on the calendar

## Progress

**Execution Order:**
Phase 0 → Phase 1a → Phase 1b → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9.

Phase 1a and 1b are cognitively parallel (different domains) but ship sequentially given solo-dev constraint. Phase 6 cannot start until Phase 5 is at least feature-complete because FCRA consent is itself a signed document going through the Phase 5 e-sign pipeline.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Vehicle Identity Unification | 2/5 | In progress (00-02 backfill complete on production; ready for 00-03 dual-write) | - |
| 1a. RBAC Upgrade | 0/TBD | Not started | - |
| 1b. Background Jobs Scaffold + Storage Consolidation | 0/TBD | Not started | - |
| 2. Inventory Core | 0/TBD | Not started | - |
| 3. Media System + Marketing Syndication | 0/TBD | Not started | - |
| 4. Deal Desk | 0/TBD | Not started | - |
| 5. Documents + E-Signature | 0/TBD | Not started | - |
| 6. Credit Applications | 0/TBD | Not started | - |
| 7. QuickBooks Online Sync | 0/TBD | Not started | - |
| 8. Reporting + AI Reporting | 0/TBD | Not started | - |
| 9. Cutover & Go-Live | 0/TBD | Not started | - |
