# Requirements: Mikalyzed DMS

**Defined:** 2026-06-02
**Core Value:** One canonical vehicle record drives the entire dealership. Every cost, photo, conversation, deal, document, and credit pull attaches to that one record — and every action is logged with who did it.

## v1 Requirements

Requirements for the DMS milestone. Each maps to a roadmap phase. Validated existing capabilities (recon, CRM pipeline, messaging, AI foundation, media uploads) are in PROJECT.md and not re-listed here.

### Vehicle Identity (Phase 0)

- [ ] **VEH-01**: One canonical vehicle record exists for every physical car (Vehicle table absorbs InventoryVehicle fields; Vehicle.id remains canonical PK)
- [ ] **VEH-02**: VehicleMigrationMap captures every old `Vehicle.id` ↔ `InventoryVehicle.id` ↔ canonical mapping with match method and confidence, preserved permanently as audit trail
- [ ] **VEH-03**: Inventory backfill is idempotent and verifiable on a Supabase preview-branch clone before live cutover
- [ ] **VEH-04**: Dual-write window (DealerCenter mirror writes to both `InventoryVehicle` AND canonical `Vehicle`) runs for ≤2 weeks before reader cutover
- [ ] **VEH-05**: After reader cutover, every DMS-facing read resolves to the canonical Vehicle; `Opportunity.vehicleId` continues to resolve correctly with no FK flip required
- [x] **VEH-06**: `Vehicle.photos[]` is dropped in Phase 0 (column is vestigial — no code reads or writes it; verified via grep). No MediaAsset migration needed; MediaAsset is Phase 3 scope. The same applies to the unused `photos[]` on VehicleStage
- [ ] **VEH-07**: Recon workflow (stage transitions, parts, checklists, mechanic board, TV board, notifications) continues to function unchanged through Phase 0
- [ ] **VEH-08**: A rollback plan exists with database snapshot + feature flag for read-from-old-vs-new and is rehearsed on a production data copy before cutover
- [ ] **VEH-09**: Legacy ID redirect endpoint (`/api/vehicles/legacy/:oldId`) returns 301 to canonical for 90 days post-cutover; iOS Capacitor build is pushed pre-cutover

### RBAC & Permissions (Phase 1a)

- [ ] **RBAC-01**: New schema (`Permission`, `RolePermission`, `UserPermission`) exists with seeded permission keys following `<module>.<action>` convention
- [ ] **RBAC-02**: `requireCan(userId, permissionKey)` helper exists alongside existing `requireRole` (no break to legacy callsites); admin role bypasses all checks
- [ ] **RBAC-03**: Permission seed maps existing roles (admin/sales_manager/sales/mechanic/detailer/content/coordinator/porter) to appropriate DMS permission keys
- [ ] **RBAC-04**: Every new DMS API route enforces `requireCan(...)` for the same key the UI gates on; UI-only checks are never the sole enforcement
- [ ] **RBAC-05**: Per-user permission overrides (`UserPermission`) are additive only (grant extra, cannot revoke role-implied permissions)

### Background Jobs & Reliability Infra (Phase 1b)

- [ ] **JOB-01**: `Job` + `JobAttempt` tables exist with status (pending/running/completed/failed/dead_letter), runAt, attempts/maxAttempts, lockedBy concurrency control
- [ ] **JOB-02**: Vercel Cron at `/api/cron/run-jobs` runs every 1 minute and processes pending jobs using `FOR UPDATE SKIP LOCKED` for concurrency safety
- [ ] **JOB-03**: Job runner dispatches by `type` to typed handlers in `lib/dms/jobs/handlers/`; failed handlers retry with exponential backoff then dead-letter
- [ ] **JOB-04**: Job system writes `ActivityLog` entries on failure-surface events (max attempts exceeded, dead-letter); ops dashboard surfaces stuck jobs
- [ ] **JOB-05**: Supabase storage usage audited and migrated to R2 in same phase (or deferred to Phase 3 if usage is broader than narrow)
- [ ] **JOB-06**: Separate Supabase project (or branch) configured as staging DB for any phase that touches credit/deals/documents

### Inventory Core (Phase 2)

- [ ] **INV-01**: `CostAdd` model exists (vehicle, kind enum [acquisition_fee/recon/parts/transport/detail/flooring_interest/pack/other], amountCents, vendorId?, receiptUrl?, addedById, addedAt, description) and rolls into computed true cost on Vehicle
- [ ] **INV-02**: VIN intake decodes via NHTSA vPIC (free) for baseline fields and a paid provider (DataOne or Chrome Data) for trim/options; results cached indefinitely keyed by VIN
- [ ] **INV-03**: Purchase source captured via `Contact(contactType=vendor)` or extended `Vendor` model; every CostAdd can reference the vendor
- [ ] **INV-04**: Vehicle has explicit `purchaseType` (PURCHASED / TRADE_IN / CONSIGNMENT) controlling whether flooring fields are applicable
- [ ] **INV-05**: `FlooringAccrual` model + daily Vercel-cron accrual job computes per-vehicle interest (principal × per-diem rate × days), writes CostAdd entries, updates Vehicle running true cost cache
- [ ] **INV-06**: Flooring accrual job is filtered hard to `purchaseType = PURCHASED AND flooringStatus = active` — never accrues on consignment or paid-off units
- [ ] **INV-07**: Floorplan curtailment schedule (per-line dueDate + percentDue) is tracked; dashboard surfaces upcoming and overdue curtailments
- [ ] **INV-08**: Flooring rate history (effectiveDate + rate) captures rate changes; accrual computes per-day with rate-in-effect, not single period rate
- [ ] **INV-09**: Vehicle detail page surfaces full `ActivityLog` timeline for that vehicle (every cost, photo, status, message, deal)
- [ ] **INV-10**: Inventory aging buckets (0-30 / 31-60 / 61-90 / 90+) computed from acquisition date (not publish date), surfaced on inventory list with cost-to-keep-per-day
- [ ] **INV-11**: Flooring exposure dashboard sums outstanding principal + accrued interest by lender across the active fleet
- [ ] **INV-12**: Hold/"do not sell" flag (reason enum + note) on Vehicle that gates marketing syndication and deal-desk

### Media System (Phase 3)

- [ ] **MEDIA-01**: `MediaAsset` model exists (vehicleId, type [exterior/interior/undercarriage/walkaround_video/turntable_video/doc], order, r2Key, derivedKeys?, uploadedById, capturedAt) and replaces `Vehicle.photos[]`
- [ ] **MEDIA-02**: Walkaround and turntable video upload uses existing UploadLink + multipart S3/R2 pipeline; web-optimized derivatives generated via sharp
- [ ] **MEDIA-03**: "Send content" popup lets a salesperson pick a typed set of media for a vehicle and produces a shareable link (or downloadable bundle) in two clicks
- [ ] **MEDIA-04**: Stale-media flag (front-line N+ days, no new media since front-line-ready date) surfaces on inventory list and on the content team's queue
- [ ] **MEDIA-05**: Marketing channel syndication model exists (`MarketingPlacement` per channel with status: pending/synced/error); from one screen, a vehicle can be pushed to configured channels with price/photos/status

### Customer / Deal Desk (Phase 4)

- [ ] **CUST-01**: When a `Deal` transitions to `funded`, the linked `Contact.contactType` flips from `lead` to `customer` (no new Customer table); transition is logged in ActivityLog
- [ ] **DEAL-01**: `Deal` model exists linking Contact (buyer/seller) + canonical Vehicle + optional Opportunity + trade-ins; supports retail_cash, retail_outside_financed, wholesale, consignment_payout via `type` discriminator
- [ ] **DEAL-02**: `Deal.state` machine implements draft → worksheet_complete → documents_sent → documents_signed → (credit_approved) → funded → voided; all transitions go through `transitionDeal(id, to, actor)` which writes `DealStateTransition` + `ActivityLog`
- [ ] **DEAL-03**: Won-Opportunity → Deal is an explicit user action ("Create Deal"); Opportunity only moves to "won" stage when Deal reaches `funded`
- [ ] **DEAL-04**: `Deal.opportunityId` (FK to Opportunity) and `Opportunity.dealId` (back-pointer) are maintained as a one-deal-per-opportunity invariant; cleared when deal is voided
- [ ] **DEAL-05**: Deal worksheet captures sale price, doc fee, electronic title fee, tag/title fees (configurable per county), trade allowance, trade payoff (with good-through date), GAP, VSC, deposit; all money in integer cents
- [ ] **DEAL-06**: FL deal math: `taxableBase = vehiclePrice + (config.flDocFeeTaxable ? docFee : 0) + dealerAddOnsTaxable − max(0, tradeAllowance)`; `stateTax = base × stateRate`; `countySurtax = min(base, surtaxCap) × countyRate`; rates + cap configurable, not hardcoded
- [ ] **DEAL-07**: Surtax sourced to the buyer's county of residence (with override + reason); `FLCountySurtaxRate` table tracks effectiveDate so historical deals retain their period's rate
- [ ] **DEAL-08**: Government fees (tag, title, registration) are classed `governmentFee` and excluded from taxable base; dealer fees and dealer add-ons are classed `dealerFee`/`dealerAddOn` and included
- [ ] **DEAL-09**: Trade-in workflow distinguishes `tradeAllowance` (negotiated value, drives tax credit) from `tradePayoff` (to lien) and tracks payoff good-through date; `payoffVariance` is captured if actual differs and posts to QBO when reconciled
- [ ] **DEAL-10**: Consignment deal computes consignor payout from a stored commission contract (`commissionBase` enum, rate, floor, ceiling); voided deals reverse commission
- [ ] **DEAL-11**: Gross profit calc: front gross = sale price − bookedCost (= trueCost + pack) − over-allowance; back gross = GAP + VSC product profit; total = front + back; stored on funded Deal
- [ ] **DEAL-12**: Out-the-door (OTD) calculator: live worksheet UI updates every variable in real time; one-click "what's my gross at this price" surfaces for sales rep
- [ ] **DEAL-13**: Deal templates (FL retail cash / FL retail outside-financed / wholesale / consignment / out-of-state) preconfigure required fees, doc set, and tax behavior
- [ ] **DEAL-14**: Deal unwind workflow reverses inventory state, marks the deal `unwound` with reason, and queues QBO reversal entries
- [ ] **DEAL-15**: Funded floored unit triggers final flooring accrual through funded date; computed payoff (principal + accrued interest) stored on Deal; flooring status → paid_off

### Documents + E-Signature (Phase 5)

- [ ] **DOC-01**: `DocumentTemplate` model (key, name, version, pdfR2Key, fields JSON, isActive); template files are immutable versions; updates create v2, never modify v1
- [ ] **DOC-02**: `Document` model attaches to Deal OR Vehicle; states draft/sent_to_sign/signed/declined/voided/superseded/external_upload; stores filled PDF, signed PDF, audit certificate R2 keys
- [ ] **DOC-03**: Document prefill uses `pdf-lib` to fill templates with deal + contact + vehicle data; raw template PDFs are committed to the repo as the immutable source of truth (state forms preserved unmodified)
- [ ] **DOC-04**: FL retail packet generation: purchase agreement, deposit, bill of sale, FTC Buyers Guide (English + Spanish where required), as-is acknowledgment, federal odometer disclosure, HSMV title forms (82040/82042/82139/82994 — confirm current numbers), POA, GLBA privacy notice, doc-fee disclosure
- [ ] **DOC-05**: `RequiredFormSet` per deal type gates "Send for Signature" — disabled until every required form is present in the packet
- [ ] **DOC-06**: `DealSnapshot` freezes deal field values (tax, fees, vehicle data, customer data) at signing; signed-state deal UI reads from snapshot, not live values; never edited post-sign
- [ ] **DOC-07**: Embedded e-signature integration via provider adapter (`ESignProvider` interface; one impl: BoldSign OR Anvil — provider choice locked at start of phase); signing happens in iframe inside `/deals/[id]/sign` page
- [ ] **DOC-08**: `SigningSession` model tracks provider session id, embed URL, webhook events processed (idempotency log); webhook handler at `/api/webhooks/esign` verifies HMAC signature, idempotency-checks event_id, enqueues `esign.fetch_signed_artifacts` job
- [ ] **DOC-09**: Signed-artifact job downloads signed PDF + audit certificate from provider and stores both in R2; verifies pre-signature hash matches the bytes we sent; failure raises ops alert
- [ ] **DOC-10**: When all required Documents on a Deal are `signed`, Deal transitions to `documents_signed` automatically
- [ ] **DOC-11**: ESIGN/UETA consumer-consent step uses provider's out-of-the-box consent screen, with audit certificate entry verified; legal-reviewed consent language
- [ ] **DOC-12**: Voided deals mark attached signed documents `voided` (status only, never deletion); signed PDFs retained for FL dealer recordkeeping period (default 5 years, verify with attorney)
- [ ] **DOC-13**: Files tab on Vehicle stores non-deal documents (titles, registrations, receipts) with type + uploader + activity log
- [ ] **DOC-14**: Customer-facing deal share link (`app/u/[token]`) renders read-only OTD breakdown for review before signing

### Credit Applications (Phase 6)

- [ ] **CRED-01**: `CreditApplication` + `CreditPull` + `CreditAccessLog` models exist; no SSN/DOB columns anywhere in DMS schema (verified via Phase 6 PR review)
- [ ] **CRED-02**: Credit app form posts SSN/DOB directly to provider iframe or API endpoint — request body never traverses Next.js server; `/api/credit-*` endpoints scrub request bodies from logs
- [ ] **CRED-03**: Provider adapter (`CreditProvider` interface; one impl: 700Credit OR eLEND — locked at start of phase) handles `submitApplication`, `pollStatus`, `fetchReport`, `verifyWebhook`
- [ ] **CRED-04**: Hard credit pull requires a `CreditApplication.consentSigned` document on file dated before the pull; endpoint returns 403 without one
- [ ] **CRED-05**: `CreditPull.type` enum is `soft_prequal | hard_underwriting`; each type has its own consent document template; bureau request constructed from type (no default)
- [ ] **CRED-06**: Soft-pull prequal flow available via public customer link (`app/u/[token]`) with consent capture; sends `lead → qualified_lead` signal on success
- [ ] **CRED-07**: `CreditAccessLog` writes a row every time credit data is fetched or viewed (actorId, accessType, ipAddress, userAgent, pulledAt); separate from ActivityLog for GLBA audit isolation
- [ ] **CRED-08**: Every credit-data read goes through `creditService.viewWithAudit(pullId, accessType, user, req)`; direct `prisma.creditPull.findMany` outside `lib/dms/credit/` is forbidden by code-review convention
- [ ] **CRED-09**: Webhook handler at `/api/webhooks/credit` verifies HMAC, idempotency-checks event_id, stores provider's pull reference + score + decision, enqueues compliance-doc fetch job
- [ ] **CRED-10**: Adverse-action notice tracking: on denied pulls, a pending `AdverseActionNotice` task is created with SLA (ECOA/FCRA window — confirm with attorney); delivery confirmation captured in ActivityLog
- [ ] **CRED-11**: Red Flags / OFAC results from provider are surfaced in deal UI; hits require explicit user review with reason logged before deal can proceed
- [ ] **CRED-12**: Credit pulls have `permittedDealIds[]` allowlist preventing stale-pull reuse on unrelated deals
- [ ] **CRED-13**: Provider sandbox + synthetic test SSNs are wired before any Phase 6 code runs against real data; non-prod env refuses to call live credit endpoints

### QuickBooks Online Sync (Phase 7)

- [ ] **QBO-01**: OAuth flow + `QboToken` model store encrypted access + refresh tokens; daily job refreshes access token before expiry; admin email alert if refresh token within 7 days of expiry
- [ ] **QBO-02**: `AccountingMapping` settings table maps semantic keys (`sales_tax_state_payable`, `cogs_used_vehicles`, etc.) to QBO account IDs; sync code references semantic keys only, never raw IDs
- [ ] **QBO-03**: `QboSyncRecord` tracks per-entity sync state (entityType, entityId, qboEntityId, status, attempts, lastError, payloadHash); unique on (entityType, entityId) for idempotency
- [ ] **QBO-04**: Funded retail deal pushes a multi-line journal entry (cash/AR, COGS, Vehicle Inventory CR, Sales Revenue, Sales Tax Payable state + county separate accounts, Doc Fee Income); sum of lines asserts equal to deal total in cents before sending
- [ ] **QBO-05**: CostAdd posts to a Work-in-Process inventory account; deal close transfers WIP balance to COGS for that vehicle — period-matched with revenue
- [ ] **QBO-06**: Flooring payoff entry on funded deal: DR Flooring Liability, CR Cash
- [ ] **QBO-07**: Trade-in acquisition entry: DR Vehicle Inventory (allowance or ACV per accountant convention), CR Customer Deposit or Sales Discount for any over-allowance
- [ ] **QBO-08**: GAP/VSC F&I product entries (DR Cash, CR F&I Income at retail; DR F&I COGS, CR AP at provider cost) — separate income and COGS accounts
- [ ] **QBO-09**: Voided/unwound deals push reversing entries that reference original by ID; reconciliation report verifies every voided deal in DMS has matching reversal in QBO
- [ ] **QBO-10**: Daily reconcile job pulls QBO entities updated in last 24h; flags mismatches (DMS says synced but QBO returns 404, etc.); admin reviews and clears `QboReconciliationFlag`
- [ ] **QBO-11**: QBO sync failure surfaces in admin "stuck syncs" page; manual retry + manual override + skip-with-reason buttons available
- [ ] **QBO-12**: Customer / Vendor sync (one-way push to QBO) on deal funding and CostAdd creation; no two-way pull for v1

### Reporting + AI Reporting (Phase 8)

- [ ] **REP-01**: Canned report library covers: inventory aging (with cost-to-keep), front-line readiness, gross by unit, gross by source, sales by rep, flooring exposure, days-to-sell distribution, deal lifecycle / close rate, F&I penetration, tax liability snapshot, unwound deals, audit/CreditAccessLog filtered views
- [ ] **REP-02**: AskAI is extended with tool-use schemas for the canonical DMS data model; supports natural-language ad-hoc reports across deals/inventory/contacts/cost/credit (within RBAC permission scope)
- [ ] **REP-03**: AI-generated reports can be "promoted" to a saved canned report (the underlying query is captured + named for re-run)
- [ ] **REP-04**: Anomaly alerts: rule-based detection (re-photographed 5+ times, doc fee below standard, cost add 3× vendor avg, etc.) with AI summary
- [ ] **REP-05**: Weekly digest auto-emailed (Mon AM) summarizing the prior week's gross, units, aging changes, flooring exposure, anomalies; opt-in per admin user
- [ ] **REP-06**: Audit packet export: given a date range, dumps all funded deals + signed documents + activity logs + credit-access logs as a zip for compliance evidence
- [ ] **REP-07**: Drill-down navigation works end-to-end: aging report → vehicle detail → activity log → deal/message that explains the gap

### Cutover & Go-Live (Phase 9)

- [ ] **CUT-01**: Dual-entry period for parallel running DMS alongside DealerCenter is capped at ≤2 weeks; daily reconciliation report shows <5% delta between systems for 5 consecutive business days before cutover
- [ ] **CUT-02**: Cutover date announced in advance; after that date DealerCenter is read-only (no new deals) and stays read-only for 90 days then archived
- [ ] **CUT-03**: Open DealerCenter deals at cutover are completed in DealerCenter (not migrated mid-deal); new deals start in DMS only
- [ ] **CUT-04**: Read-only historical import of DealerCenter deals for prior 24 months loads into DMS marked `source=dealercenter_import`; reports filter to include/exclude
- [ ] **CUT-05**: Operator runbook documents: deploy rollback, Vercel log reading, feature-flag toggle, manual data correction procedure, compliance-incident response, on-call escalation
- [ ] **CUT-06**: Compliance review sign-off documented per phase (Phase 5 docs + Phase 6 credit) before respective feature flags enabled in production

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Pricing & Market Data

- **PRICE-01**: Integrated market-comp data feed (MMR / Black Book / vAuto) to power AI-suggested pricing band
- **PRICE-02**: "What-if" pricing scenarios ("drop price by $500 → projected days-to-sell?")

### Advanced Integrations

- **INT-01**: Direct API integration with flooring lenders (NextGear / AFC / Floorplan Xpress) if/when available
- **INT-02**: Real-time bidirectional QBO sync (vs current event-driven push)
- **INT-03**: Two-way customer/vendor sync from QBO
- **INT-04**: Titling service handoff automation (currently manual)

### Multi-Tenant / Scale

- **MT-01**: Tenant scoping on every entity (currently single-tenant Mikalyzed)
- **MT-02**: Multi-location inventory transfer workflow

### Advanced F&I

- **FNI-01**: Subprime lender routing (Dealertrack-style) — requires reseller credentialing
- **FNI-02**: In-house financing / Retail Installment Contracts — would open Reg Z/TILA scope, requires licensed RIC forms

### Reporting Depth

- **REP-V2-01**: AI-driven predictive analytics ("forecast next 30 days of gross") — defer until enough historical data
- **REP-V2-02**: Cross-store / multi-dealer benchmarks

## Out of Scope

Explicitly excluded for v1. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| In-house / BHPH retail installment contracts | Opens Reg Z/TILA scope; user decided cash + outside financing only |
| Self-hand-rolled credit bureau integration | Bureau access requires authorized reseller credentialing |
| Self-hand-rolled e-signature cryptographic seal / trusted timestamp | Server-generated timestamps fail in dispute; rent BoldSign/Anvil |
| Real-time WebSocket dashboards | Polling suffices; not a v1 blocker |
| Multi-tenant / multi-dealer support | Single-tenant for Mikalyzed; multi-tenant is separate future track |
| New Customer table (separate from Contact) | `Contact.contactType` already supports lead→customer transition |
| Replacing existing recon stage workflow | Phase 0 re-points it; doesn't rebuild |
| New activity log system | `ActivityLog` is the sink; DMS writes to it, doesn't replace it |
| Mobile-first Sales app + mobile Instagram DMs | Explicitly paused per current direction |
| Subprime lender routing / Dealertrack submission | Paid networks with credentialing; out of scope |
| Notary / online notary integration | Consumer-side rarely needed in FL used-car sales |
| HSMV title submission automation | Months of compliance work; use a titling service |
| Custom contract template builder UI for non-developers | Legal docs — dev-managed only |
| Real-time payment calculator with APR | Cash + outside finance only; lender computes APR |
| MMR/Kelley pricing module | Requires paid data feed (deferred to v2) |
| QuickBooks Desktop integration | Web Connector is deprecated path; QBO API only |
| Direct flooring-lender API integration | Most are partner-gated; manual entry is fine for v1 |
| Full F&I menu beyond GAP/VSC | Opens Reg M / insurance licensing scope |
| Plugin / extension marketplace | Single-store, single-dev |
| Cross-store reporting / benchmarks | Locked out per multi-tenant exclusion |

## Traceability

Every v1 requirement is mapped to exactly one phase. Updated by roadmapper on 2026-06-02 during ROADMAP.md creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VEH-01 | Phase 0 | In Progress (0.A schema ready in 00-01; backfill in 00-02) |
| VEH-02 | Phase 0 | In Progress (VehicleMigrationMap model created in 00-01; populated by 00-02 backfill) |
| VEH-03 | Phase 0 | Pending |
| VEH-04 | Phase 0 | Pending |
| VEH-05 | Phase 0 | Pending |
| VEH-06 | Phase 0 | Complete (00-01: photos[] dropped on Vehicle + VehicleStage; MediaAsset deferred to Phase 3) |
| VEH-07 | Phase 0 | Pending |
| VEH-08 | Phase 0 | Pending |
| VEH-09 | Phase 0 | Pending |
| RBAC-01 | Phase 1a | Pending |
| RBAC-02 | Phase 1a | Pending |
| RBAC-03 | Phase 1a | Pending |
| RBAC-04 | Phase 1a | Pending |
| RBAC-05 | Phase 1a | Pending |
| JOB-01 | Phase 1b | Pending |
| JOB-02 | Phase 1b | Pending |
| JOB-03 | Phase 1b | Pending |
| JOB-04 | Phase 1b | Pending |
| JOB-05 | Phase 1b | Pending |
| JOB-06 | Phase 1b | Pending |
| INV-01 | Phase 2 | Pending |
| INV-02 | Phase 2 | Pending |
| INV-03 | Phase 2 | Pending |
| INV-04 | Phase 2 | Pending |
| INV-05 | Phase 2 | Pending |
| INV-06 | Phase 2 | Pending |
| INV-07 | Phase 2 | Pending |
| INV-08 | Phase 2 | Pending |
| INV-09 | Phase 2 | Pending |
| INV-10 | Phase 2 | Pending |
| INV-11 | Phase 2 | Pending |
| INV-12 | Phase 2 | Pending |
| MEDIA-01 | Phase 3 | Pending |
| MEDIA-02 | Phase 3 | Pending |
| MEDIA-03 | Phase 3 | Pending |
| MEDIA-04 | Phase 3 | Pending |
| MEDIA-05 | Phase 3 | Pending |
| CUST-01 | Phase 4 | Pending |
| DEAL-01 | Phase 4 | Pending |
| DEAL-02 | Phase 4 | Pending |
| DEAL-03 | Phase 4 | Pending |
| DEAL-04 | Phase 4 | Pending |
| DEAL-05 | Phase 4 | Pending |
| DEAL-06 | Phase 4 | Pending |
| DEAL-07 | Phase 4 | Pending |
| DEAL-08 | Phase 4 | Pending |
| DEAL-09 | Phase 4 | Pending |
| DEAL-10 | Phase 4 | Pending |
| DEAL-11 | Phase 4 | Pending |
| DEAL-12 | Phase 4 | Pending |
| DEAL-13 | Phase 4 | Pending |
| DEAL-14 | Phase 4 | Pending |
| DEAL-15 | Phase 4 | Pending |
| DOC-01 | Phase 5 | Pending |
| DOC-02 | Phase 5 | Pending |
| DOC-03 | Phase 5 | Pending |
| DOC-04 | Phase 5 | Pending |
| DOC-05 | Phase 5 | Pending |
| DOC-06 | Phase 5 | Pending |
| DOC-07 | Phase 5 | Pending |
| DOC-08 | Phase 5 | Pending |
| DOC-09 | Phase 5 | Pending |
| DOC-10 | Phase 5 | Pending |
| DOC-11 | Phase 5 | Pending |
| DOC-12 | Phase 5 | Pending |
| DOC-13 | Phase 5 | Pending |
| DOC-14 | Phase 5 | Pending |
| CRED-01 | Phase 6 | Pending |
| CRED-02 | Phase 6 | Pending |
| CRED-03 | Phase 6 | Pending |
| CRED-04 | Phase 6 | Pending |
| CRED-05 | Phase 6 | Pending |
| CRED-06 | Phase 6 | Pending |
| CRED-07 | Phase 6 | Pending |
| CRED-08 | Phase 6 | Pending |
| CRED-09 | Phase 6 | Pending |
| CRED-10 | Phase 6 | Pending |
| CRED-11 | Phase 6 | Pending |
| CRED-12 | Phase 6 | Pending |
| CRED-13 | Phase 6 | Pending |
| QBO-01 | Phase 7 | Pending |
| QBO-02 | Phase 7 | Pending |
| QBO-03 | Phase 7 | Pending |
| QBO-04 | Phase 7 | Pending |
| QBO-05 | Phase 7 | Pending |
| QBO-06 | Phase 7 | Pending |
| QBO-07 | Phase 7 | Pending |
| QBO-08 | Phase 7 | Pending |
| QBO-09 | Phase 7 | Pending |
| QBO-10 | Phase 7 | Pending |
| QBO-11 | Phase 7 | Pending |
| QBO-12 | Phase 7 | Pending |
| REP-01 | Phase 8 | Pending |
| REP-02 | Phase 8 | Pending |
| REP-03 | Phase 8 | Pending |
| REP-04 | Phase 8 | Pending |
| REP-05 | Phase 8 | Pending |
| REP-06 | Phase 8 | Pending |
| REP-07 | Phase 8 | Pending |
| CUT-01 | Phase 9 | Pending |
| CUT-02 | Phase 9 | Pending |
| CUT-03 | Phase 9 | Pending |
| CUT-04 | Phase 9 | Pending |
| CUT-05 | Phase 9 | Pending |
| CUT-06 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 99 total
- Mapped to phases: 99
- Unmapped: 0

---
*Requirements defined: 2026-06-02*
*Last updated: 2026-06-02 — traceability populated by roadmapper (Phase 0 → Phase 9 mapping)*
