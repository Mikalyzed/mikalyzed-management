# Project Research Summary

**Project:** Mikalyzed DMS (DealerCenter replacement)
**Domain:** Dealer Management System — single-store independent used-car dealer (Florida), solo developer, layered onto existing production Next.js 15 + Prisma 6 + Postgres app
**Researched:** 2026-06-02
**Confidence:** MEDIUM-HIGH on patterns, architecture, and build/buy posture; LOW on specific FL statutes, current provider pricing, and current HSMV form numbers (web verification was unavailable this session — these require human verification before encoding)

---

## Executive Summary

This is a domain extension to an existing, in-production operations app — not a new product. The DMS replaces DealerCenter by unifying recon, inventory, deal desk, documents/e-sign, credit, accounting sync, and reporting around **one canonical vehicle row** with **one accountability sink** (`ActivityLog`), **one richer permission model** (compatible with existing `requireRole`), and **one reliability layer** for outbound integrations. There is no new framework, no new DB, no new service — new code lives in `lib/dms/<domain>/` as service modules behind thin API routes, with provider adapters isolating BoldSign/Anvil (e-sign), 700Credit/eLEND (credit), and QuickBooks Online (accounting).

The recommended approach is **integrate the regulated work** (e-sign cryptographic sealing, FCRA-credentialed credit bureau access, QBO API) and **build the unregulated layer** (FL deal math, PDF prefill via `pdf-lib`, cost/flooring math, RBAC, document templates, reporting). Vendor lock-in for credit and accounting is HIGH and structurally unavoidable; the mitigation is strict adapter interfaces + storing decision outcomes and journal entries in DMS-owned tables rather than provider-keyed schemas. The build-vs-integrate split aligns with PROJECT.md and is the right call for a solo operator.

The single largest risk is **Phase 0 (vehicle unification)**. A live production app, real recon users, no rollback if it breaks. The next-largest risks are compliance-gated: ESIGN/UETA consent capture (Phase 5), FCRA permissible-purpose logging + SSN handling (Phase 6), and FL-specific tax/fee math (Phase 4). Mitigation strategy is **sub-phase shipping** (1–2 week cap, feature-flagged), **attorney review as a hard gate** before flag-on in production for compliance phases, separate staging Postgres and provider sandboxes, and an explicit, additive Phase 0 migration plan rather than a big-bang FK flip.

---

## Key Findings

### Recommended Stack

The baseline stack (Next.js 15, Prisma 6, Postgres/Supabase, Vercel, R2, Cloudinary, Twilio, Microsoft Graph, Anthropic, Capacitor) is unchanged. New capabilities are additive npm packages or HTTP REST integrations behind in-house adapters.

**Core technologies (new for DMS milestone):**

- **`pdf-lib`** — PDF AcroForm fill + flatten for FL retail packet (purchase agreement, FTC Buyers Guide, federal odometer, HSMV forms, POA, privacy notice) — pure JS, serverless-friendly, mature
- **`pdfme`** (escape hatch) — template-based generation only when filling an existing vendor PDF doesn't fit
- **BoldSign** (primary e-sign; Anvil/Dropbox Sign as fallbacks) — embedded signing iframe, audit certificate with trusted timestamp, REST + Node SDK; **verify 2026 pricing live before contract**
- **700Credit** (primary credit reseller; eLEND as fallback) — FCRA reseller credentialing, OFAC + Red Flags + adverse action bundled; we store provider references only, never raw NPI; **expect days of onboarding lead time — apply during Phase 0/1**
- **NHTSA vPIC** (free, government, stable) + **DataOne Vehicle Database API** (paid, trim/options) — two-tier VIN decode; cache premium pulls indefinitely (VIN is deterministic)
- **Intuit OAuth 2.0** via `intuit-oauth` + raw `fetch` against QBO REST — token rotation, refresh-token-on-every-refresh discipline mandatory
- **FL deal math: BUILD in-house** with rates in DB (`TaxRate` keyed by `effectiveDate` + `county`); no library fits an indie FL dealer; Avalara/TaxJar are wrong shape and overkill
- **Background jobs: Vercel Cron + DB-backed `Job` table** with `FOR UPDATE SKIP LOCKED` — no new vendor, swappable to Inngest later behind a stable interface
- **Vitest** — first tests in the codebase, gated to `lib/dms/dealmath/*` and provider adapter contracts

**Storage consolidation:** R2 = source of truth for all bytes (recon photos, signed PDFs, audit certs, credit consent docs, templates, customer uploads). Cloudinary stays for the messaging media pipeline (on-the-fly transformations). **Drop Supabase storage** from new code paths; migrate any narrow existing usage during Phase 1b or Phase 3 — half-day task.

See `.planning/research/STACK.md` for provider rationales, alternatives considered, install commands, and the compliance-posture matrix (FCRA / GLBA / ESIGN / UETA / FTC Used Car Rule / HSMV / FL doc-fee / FL tax).

### Expected Features

The product replaces DealerCenter for a single-store FL independent used-car dealer doing cash + outside-financed retail (plus wholesale dispositions and consignment intake). The feature landscape sorts into clean table-stakes / differentiators / anti-features per domain.

**Must have (table stakes — without these, dealers won't switch):**
- Canonical vehicle (VIN, stock #, YMM/trim, miles, color, body, drivetrain, fuel) + VIN decode at intake
- Itemized cost build-up (acquisition + auction fees + transport + recon + pack) with receipts/actor/timestamps
- Per-vehicle flooring with daily interest accrual, curtailment schedule, and payoff-at-sale
- Title status tracking (ordered / in-transit / in-hand / lien / branded / lost)
- Deal record with trade-in (allowance vs ACV vs payoff with good-through date), FL tax + surtax, doc fee, tag/title pass-through, gross-profit calc
- FL retail document packet (purchase agreement, bill of sale, deposit, FTC Buyers Guide + As-Is, federal odometer, HSMV 82040 / 82042 / 82139 / 82994, POA, privacy notice) with **embedded e-signature + audit certificate stored in R2**
- Credit application capture → soft prequal → hard pull on funded deal, with FCRA consent and adverse-action delivery
- QBO sync of funded deals, cost adds, flooring payoffs (push primary, daily reconcile secondary)
- Canned reports: inventory aging with cost-to-keep-per-day, gross by unit/source, flooring exposure, sales by rep, F&I penetration, tax liability snapshot, unwound deals
- Deal unwind workflow (reverses inventory + accounting + logs reason — do not underestimate)

**Should have (differentiators — where in-house beats DealerCenter):**
- Live deal-math worksheet (every variable updates OTD in real time, server-validated on save)
- Customer-facing read-only deal share link (review on phone before walking in) — extends existing `app/u/[token]`
- Deal-to-flooring-payoff visible in the worksheet (no NextGear call needed)
- Itemized cost adds with receipts/actor/activity log (DealerCenter has a flat number)
- Real-time daily cost view ("this car has cost $X as of today incl $Y flooring accrual")
- AI-extended reporting (`AskAI` over the DMS data model — natural-language ad-hoc queries, anomaly summaries, weekly digest)
- Audit-log viewer UI surfaced on every vehicle/deal/contact
- "Packet completeness" pre-flight check before signing (VIN matches title, odometer present, GAP/VSC attached if sold, lender check info present)
- Per-deal-type template bundling (cash retail / outside-financed / wholesale / consignment / out-of-state)
- Spanish-language packet (real FL concern; compliance + UX win — confirm day-one vs later)

**Defer to v2+ (or out of scope):**
- In-house / BHPH financing, RIC generation, Dealertrack-style submission (Reg Z/TILA scope — locked out)
- Direct bureau integration / hand-rolled credit infrastructure
- Hand-rolled cryptographic signing
- Real-time WebSocket dashboards (polling is fine — locked out)
- Multi-tenant / multi-dealer (locked out)
- Mobile-first Sales + mobile IG DMs (paused per current direction)
- Holdback tracking, multi-location inventory transfer, MMR/Kelley paid-data pricing module, predictive ML forecasting (data volume too small)
- Real-time bidirectional QBO sync (one-way push is enough)

See `.planning/research/FEATURES.md` for the per-domain table (Inventory, Flooring, Deal Desk, Documents, Credit, QBO, Reporting + AI) with complexity, FL-specificity flags, and anti-features.

### Architecture Approach

**Modular monolith inside the existing Next.js app.** No new service, no new framework, no new DB. New code lives in `lib/dms/<domain>/` (vehicle, costing, media, deal, document, esign, credit, qbo, rbac, jobs, audit) as service modules with explicit interfaces and provider adapters. API routes stay thin. Services own ActivityLog writes, idempotency, webhook reconciliation, and state-machine transitions.

**Major components:**

1. **`lib/dms/vehicle`** — canonical resolver, recon-bridge, owns `Vehicle` (post-merge canonical row)
2. **`lib/dms/costing`** — `CostAdd` math, daily flooring accrual, true-cost computation; writes denormalized cache to `Vehicle.totalCostCache`
3. **`lib/dms/deal`** — `Deal`, trade-ins, fees, state machine (`draft → worksheet_complete → documents_sent → documents_signed → credit_approved → funded` + `voided`), FL tax math
4. **`lib/dms/document`** — `DocumentTemplate` registry, `pdf-lib` prefill, packet bundling per deal type, R2 storage
5. **`lib/dms/esign`** — provider adapter (BoldSign | Anvil), `SigningSession`, webhook idempotency, async artifact download via Job
6. **`lib/dms/credit`** — provider adapter (700Credit | eLEND), `CreditApplication`, `CreditPull`, **separate `CreditAccessLog`** table (NOT ActivityLog — GLBA isolation)
7. **`lib/dms/qbo`** — push-primary + daily reconcile, `QboSyncRecord` with idempotency, refresh-token cron
8. **`lib/dms/rbac`** — `Permission` + `RolePermission` + `UserPermission` tables, `requireCan(userId, 'credit.run_hard')`, additive to existing `requireRole`
9. **`lib/dms/jobs`** — `Job` + `JobAttempt`, Vercel Cron poll every 1 min, `FOR UPDATE SKIP LOCKED` claim, exponential backoff, dead-letter
10. **`lib/dms/audit`** — `ActivityLog` writer + `CreditAccessLog` writer; every mutation writes inside the same `prisma.$transaction`

**Patterns to enforce:**
- Thin route → service module → Prisma (no logic in components, no logic in routes)
- All state transitions go through `transitionX(id, to, actor, reason)` functions; no raw `prisma.X.update({ state })` elsewhere
- Money as integer cents in DB and in code; never floats
- Every webhook: verify signature → idempotency-check → enqueue job (never heavy work inline)
- Every credit data read goes through `creditService.viewWithAudit(...)` (consider an ESLint rule banning direct `prisma.creditPull.findMany` outside `lib/dms/credit/`)

See `.planning/research/ARCHITECTURE.md` for the full component map, Phase 0 migration plan (additive → backfill → dual-write → reader cutover → decommission), Prisma schemas for Deal / Document / SigningSession / CreditApplication / CreditPull / CreditAccessLog / QboSyncRecord / Job, and 7 anti-patterns to avoid.

### Critical Pitfalls

The full pitfall register is in `.planning/research/PITFALLS.md` (Critical / Moderate / Minor across 11 domains). The cross-cutting ones that shape the roadmap:

1. **Phase 0 — Opportunity attribution silently re-targets the wrong vehicle**, and recon flow breaks because state lives on `Vehicle.id`. Mitigation: **keep `Vehicle.id` as canonical PK** (Strategy A — see disagreement with PROJECT.md below), additive schema only, idempotent backfill on a clone first, dual-write window, reader cutover, decommission `InventoryVehicle` after 30-day audit window. Snapshot + mapping table preserved as audit trail.

2. **FL deal math — doc-fee taxability, surtax cap, trade-in credit clamp, sourcing rule (purchaser's county of registration).** Mitigation: rates in DB (not hardcoded), integer cents throughout, line-by-line tax breakdown in UI, shadow-deal reconciliation against DealerCenter for the first month, accountant sign-off on every rule before encoding.

3. **ESIGN consent + audit-certificate integrity (Phase 5).** Use provider's out-of-the-box consent screen — never customize away or pre-fill the consent click. Treat the prefilled PDF as immutable the moment it's handed to the e-sign provider (store SHA-256 before send; verify after). Display signing time from the provider's audit certificate, not from a self-generated timestamp. Snapshot the deal at signing (`DealSnapshot { dealId, fieldsJson, signedAt }`) so signed-PDF math can never diverge from DB.

4. **Phase 6 — SSN/DOB must never traverse the Next.js server.** Credit app form **posts directly to provider's iframe/API**, not through our server. Server-side log scrubbing on `/api/credit-*`. Disable autofill on SSN fields. No "save draft" on credit forms. Every credit pull requires `creditApplicationId` whose status is `consentSigned` (signed via Phase 5 e-sign) — 403 otherwise. Every view of credit data writes to a separate `CreditAccessLog` table (write-only by convention; tamper-evident for GLBA audit).

5. **Phase 7 — Voided/unwound deals must produce reversing QBO entries** (never delete originals — auditors need the trail). Integer-cent precision throughout; assert sum-of-lines = deal-total to the cent before pushing. Cost adds post to Work-In-Process initially; transfer to COGS only at deal close so period matches revenue. All QBO account IDs live in **one configuration table** (`AccountingMapping`) with semantic keys — never hardcoded across the codebase.

6. **Solo-dev: over-scoping a phase such that nothing ships for 2+ months.** Mitigation: every phase has 3–5 sub-deliverables, each shipped to production within 1–2 weeks; feature-flag everything new; if a sub-phase hits week 3 without shipping, stop and cut scope. **Phase 0 is the exception** — it cannot ship partially.

7. **Attorney review treated as polish rather than gate.** Mitigation: attorney review is a **hard gate** booked on the calendar **before** dev starts on Phase 5 (ESIGN consent language + Buyers Guide language + adverse-action template + doc-fee disclosure) and Phase 6 (FCRA permissible-purpose flow, GLBA privacy notice, adverse-action timeline). Feature flag does not flip to ON in production until written legal sign-off is in the planning folder.

---

## Cross-Cutting Synthesis Callouts

These cut across STACK / FEATURES / ARCHITECTURE / PITFALLS and must surface to the roadmapper.

### 1. Phase 0 strategy disagreement with PROJECT.md

ARCHITECTURE.md (Strategy A) and PITFALLS.md both recommend **keeping `Vehicle.id` as the canonical PK and absorbing `InventoryVehicle` fields onto it**, rather than the PROJECT.md decision in "Key Decisions" to "Promote `InventoryVehicle` as canonical." Reason: `Vehicle.id` is referenced from **many** existing tables (`VehicleStage`, `Part`, `TransportRequest`, `CalendarItem`, `Opportunity`, `VehicleInterest`); `InventoryVehicle.id` is referenced from **zero**. Strategy A is ~4x safer migration (additive scalar columns onto `Vehicle`; zero FK repointing) and preserves correct sales attribution without touching `Opportunity`. **Flag for user confirmation before Phase 0 planning starts** — if the PROJECT.md decision was driven by field-ownership intuition rather than FK counting, it should be revisited.

### 2. Phase 1 should split into 1a (RBAC) + 1b (background jobs)

Both are cross-cutting infra. Both are LOW risk (additive tables + helpers, one cron endpoint). Both are HIGH leverage — every subsequent phase (4 deal, 5 docs, 6 credit, 7 QBO) calls them. Building them once early as their own milestones is cheaper than retrofitting. PROJECT.md treats them as embedded inside larger phases; ARCHITECTURE.md and FEATURES.md both argue for splitting them out. Each is shippable in days.

### 3. Cross-cutting infra needed before Phase 4 deal desk

Beyond RBAC + jobs, three more pieces have no good home in a feature phase but every later phase depends on them:
- **Separate staging Postgres** (Vercel preview deployments wired to a non-prod Supabase project) before any work touching credit / deals / documents — set up before Phase 4.
- **Structured error reporting** — DMS deal/document/credit flows cannot tolerate the current "fire-and-forget" silent-failure pattern.
- **Audit-log viewer UI** — `ActivityLog` data already exists but there's no query/export UI for compliance evidence; needed for GLBA/FCRA audit defensibility.

These belong in the 1a/1b cross-cutting milestone, not buried inside Phase 4 or 5.

### 4. GLBA-specific architectural decision: `CreditAccessLog` is its own table

Every view of credit data writes a row. Volume + retention policy + audit isolation + tamper-evidence all argue for separation from `ActivityLog`. Append-only by convention. No update/delete code paths anywhere. This is a structural decision that must be made before Phase 6 code starts, not refactored in later. The `creditService.viewWithAudit(...)` chokepoint is the only path that reads credit data.

### 5. PII handling in Phase 6 is an architectural decision, not a coding tactic

**SSN must never traverse the Next.js server.** Credit application form posts directly to provider's iframe or API endpoint. If provider iframe isn't available, post directly to provider's API from the *client* with a short-lived signed API key delivered just-in-time. Vercel function logs, server memory, request bodies — all are GLBA-breach surfaces. This decision must precede any Phase 6 code; refactoring afterward is impossible without re-architecting the form.

### 6. FL-specific verification list — attorney/accountant before encoding

All LOW confidence; all require external verification before becoming inputs to code:
- Discretionary sales surtax cap on motor vehicles (historically $5,000 — verify current)
- Doc-fee taxable status (general practice is taxable — confirm with FL DOR / accountant)
- Trade-in tax credit treatment (sale price minus allowance — confirm current law)
- Surtax sourcing rule (purchaser's county of registration — confirm current)
- HSMV form numbers (82040 / 82042 / 82139 / 82994 — confirm current revisions)
- Adverse-action delivery timelines (ECOA 5 business days / FCRA 30 days — confirm with attorney)
- Dealer recordkeeping retention period (default 5 years pending verification)
- Insurance minimums for delivery ($10K PIP + $10K PDL — confirm)
- Sales-tax exemption form references (DR-123 for nonresident buyers — confirm)
- Federal odometer disclosure threshold (rule changed recently — verify model-year cutoff)
- FTC Buyers Guide template version (Spanish required if negotiation was in Spanish — confirm current template)

### 7. Solo-dev guardrails are roadmap-shape constraints, not project-management advice

- **Sub-phase cap: 1–2 weeks per shippable increment.** If anything is hitting week 3, scope-cut.
- **Feature flags on everything new.** Partial work doesn't block production.
- **Attorney review as hard gate** before flag-flip in production for Phase 5 (ESIGN language, Buyers Guide, doc-fee disclosure, HSMV forms) and Phase 6 (FCRA permissible-purpose flow, GLBA privacy notice, adverse-action template/timeline). Schedule the review as a milestone deliverable with a written email confirmation.
- **Runbook** for the user-as-operator (rollback, log access, flag disable, manual record edit, compliance-break escalation).

### 8. Storage consolidation is a half-day task, not a phase

Drop Supabase storage from new code paths. Keep R2 (source of truth) + Cloudinary (messaging media CDN). Migrate any narrow existing Supabase usage (`grep -r supabase.storage` in `lib/` + `app/`) during Phase 1b or Phase 3. If usage is broader than expected, deprecate in place (ban new writes via lint/code-review) rather than big-bang migrate.

---

## Implications for Roadmap

Based on dependency analysis (ARCHITECTURE.md §11), pitfall ownership (PITFALLS.md phase-summary), and FEATURES.md sequencing, recommended phase structure:

### Phase 0: Vehicle Unification (HARD GATE)
**Rationale:** Every later phase attaches to one canonical vehicle. Two unrelated rows = corrupted attribution across every DMS object. This is the only phase that cannot ship partially.
**Delivers:** One canonical `Vehicle` row per physical car. Sales attribution correct. Recon flow preserved. `InventoryVehicle` decommissioned after 30-day audit window.
**Sub-phases:** 0.A (additive schema) → 0.B (idempotent backfill, dry-run on clone) → 0.C (dual-write window, 1–2 days) → 0.D (reader cutover) → 0.E (decommission).
**Strategy disagreement with PROJECT.md:** Keep `Vehicle.id` as canonical (Strategy A), not `InventoryVehicle.id`. See callout #1. **Confirm with user before starting.**
**Avoids:** Opportunity attribution drift, recon flow break, stale Capacitor cache, duplicate-VIN merge errors, `Vehicle.photos[]` loss.

### Phase 1a: RBAC upgrade
**Rationale:** Cross-cutting infra. Every subsequent phase calls `requireCan(...)`. Days-scale work; high leverage. Small enough to be its own milestone (callout #2).
**Delivers:** `Permission` + `RolePermission` + `UserPermission` tables seeded from existing role enum; admin bypass preserved; legacy `requireRole` callsites untouched; new code uses `requireCan(userId, 'credit.run_hard')` and similar keys.
**Uses:** Plain tables + key strings (rejected CASL/Casbin for solo-dev scope).
**Avoids:** Per-module permission retrofit later; GLBA RBAC gap on credit views.

### Phase 1b: Background jobs scaffold + structured error reporting + audit-log viewer + staging Postgres + storage consolidation
**Rationale:** All cross-cutting infra (callout #3 + #8). Each is small; bundling them into one milestone is cheaper than slipping them under feature phases. Required by Phases 5, 6, 7.
**Delivers:** `Job` + `JobAttempt` tables with `FOR UPDATE SKIP LOCKED`, Vercel Cron at `/api/cron/run-jobs` every 1 min, exponential backoff + dead-letter; structured error reporting (no more silent fire-and-forget); audit-log viewer UI over `ActivityLog`; separate staging Postgres wired to Vercel previews; Supabase storage migrated/deprecated to R2.
**Avoids:** Silent integration failures, GLBA/FCRA audit failure from no log viewer, production Postgres pollution during compliance testing.

### Phase 2: Inventory Core
**Rationale:** First feature phase. Depends on canonical vehicle + RBAC. Cost adds + flooring math are foundations for deal-desk gross-profit calc.
**Delivers:** `CostAdd` (itemized, receipts, actor, activity log); per-vehicle flooring (provider, advance date, daily accrual, curtailment schedule, payoff terms); VIN intake (vPIC free + DataOne paid); vendor purchasing via `Contact(contactType=vendor)`; title status tracking.
**Uses:** `pdf-lib` not needed yet; vPIC + DataOne; jobs scaffold (daily flooring accrual job).
**Avoids:** Consignment units accidentally accruing flooring interest (hard filter on `purchaseType='purchased'`), curtailment payment misses, per-diem rate-change drift, accrual timezone confusion.

### Phase 3: Media System + Marketing Syndication
**Rationale:** Depends on canonical vehicle. Replaces `Vehicle.photos[]` with typed `MediaAsset`. Marketing syndication is a content-delivery concern that logically belongs with media.
**Delivers:** `MediaAsset` model (typed: exterior / interior / undercarriage / walkaround video / turntable video / docs), ordered, replacing `Vehicle.photos[]`; sales "send content" popup with shareable links; marketing channel syndication (price, photos, status); inventory-to-marketing sync status per vehicle.
**Uses:** R2 + Cloudinary (existing); UploadLink + multipart (existing).
**Avoids:** Orphaned files in R2 (seed `MediaAsset` from `Vehicle.photos[]` and keep array readable for 30 days as fallback); channel syndication leaking unpriced/un-photographed units.

### Phase 4: Deal Desk
**Rationale:** Depends on canonical vehicle + RBAC + `CostAdd` (for gross calc). The heart of the DMS replacement. Customer promotion (lead → customer) is a 5-line side effect inside `transitionDeal(funded)` — not a separate phase.
**Delivers:** `Deal` model + state machine (`draft → worksheet_complete → documents_sent → documents_signed → credit_approved → funded` + `voided`); FL tax + county surtax (sourced by purchaser's county of registration); doc fee disclosure; trade-in (allowance vs ACV vs payoff with good-through date + per-diem); cost adds → gross profit calc; consignment commission math; flooring payoff at funding; deal unwind workflow; wholesale + consignment-payout deal types; live deal-math worksheet (single-page reactive); customer-facing read-only share link; saved deal scenarios.
**Uses:** `lib/dms/dealmath/` pure functions with rates in DB; integer cents; Vitest tests on every edge case.
**Avoids:** Doc-fee taxable rule wrong, trade-in credit clamp at zero (no negative-equity tax inflation), surtax-cap miss on high-priced units, payoff variance silently eaten, consignment commission edge cases, holdback/pack confusion, rounding accumulation.
**Compliance gate:** FL rates + sourcing rule + doc-fee disclosure language confirmed by accountant before encoding.

### Phase 5: Documents + E-Signature
**Rationale:** Depends on Deal model + jobs scaffold (artifact download is a job, not inline). The legally-required path for retail deals — without this, DMS can't replace DealerCenter for any deal that needs signatures.
**Delivers:** `DocumentTemplate` registry with version tracking; `pdf-lib` prefill for FL retail packet (purchase agreement, deposit, bill of sale, FTC Buyers Guide + As-Is, federal odometer, HSMV 82040 / 82042 / 82139 / 82994, POA, GLBA privacy notice); BoldSign (or Anvil) embedded signing; `SigningSession` with webhook idempotency; signed PDF + audit certificate stored in R2; per-deal-type packet bundling (cash retail / outside-financed / wholesale / consignment / out-of-state); packet completeness pre-flight check; deal snapshot at signing (`DealSnapshot`).
**Uses:** `pdf-lib`, BoldSign Node SDK behind `lib/dms/esign/index.ts` adapter; jobs queue for `esign.fetch_signed_artifacts`.
**Avoids:** ESIGN consent skip (use provider's out-of-the-box consent — never customize away), audit-certificate integrity gaps (treat prefilled PDF as immutable; verify SHA-256), server-side timestamps treated as trusted timestamps, template drift, signed-PDF/DB math divergence, missing HSMV forms, signer-identity attribution failure (KBA on retail purchase agreements).
**Compliance gate:** **Attorney review hard gate** on ESIGN consent language, Buyers Guide language, doc-fee disclosure, HSMV field requirements, all template content. Feature flag does not flip ON in production until written legal sign-off is in `.planning/`.
**Provider decision:** BoldSign vs Anvil — verify current pricing at ~30–50 envelopes/month with embedded signing enabled; both have completion certificate.

### Phase 6: Credit Applications
**Rationale:** Depends on Deal model + jobs scaffold + Phase 5 e-sign (FCRA consent is its own signed document). Compliance-heaviest phase.
**Delivers:** 700Credit (or eLEND) integration behind `lib/dms/credit/index.ts` adapter; `CreditApplication` + `CreditPull` storing provider references only (no raw SSN/DOB); soft-pull prequal → hard-pull on funded deal; `creditApplicationId` with `status=consentSigned` precondition (403 otherwise); FCRA permissible-purpose logged on every pull; **separate `CreditAccessLog` table** (write-only, tamper-evident, GLBA-grade); `creditService.viewWithAudit(pullId, accessType, user, req)` chokepoint; adverse-action notice handling with SLA monitor; Red Flags + OFAC surfacing; customer self-serve soft-pull prequal on a public link.
**Uses:** No npm SDK; raw `fetch` behind adapter; jobs queue for status polling + adverse-action delivery confirmation.
**Avoids:** SSN/DOB persistence (form posts directly to provider iframe/API, never to our server — callout #5); permissible-purpose violations; soft/hard pull boundary blur; viewing credit without audit log; adverse-action delivery failures; reusing a credit pull across unrelated deals.
**Compliance gate:** **Attorney review hard gate** on FCRA permissible-purpose flow, GLBA privacy notice, adverse-action template + timeline, RBAC permission keys for credit. **Apply to 700Credit and eLEND in parallel during Phase 0/1** — onboarding takes days, not minutes.

### Phase 7: QuickBooks Online Sync (Push-Only Cut First)
**Rationale:** Depends on Deal + CostAdd + jobs scaffold. Without QBO sync, every funded deal requires manual re-entry into accounting — defeats the DMS purpose.
**Delivers (push-only first cut):** `intuit-oauth` token management with refresh-on-every-refresh discipline; `QboToken` (encrypted at rest); `QboSyncRecord` with idempotency hash; `AccountingMapping` configuration table (semantic keys → QBO account IDs — never hardcoded); push on `Deal.transitionDeal(funded)` enqueues a Job; SalesReceipt (cash) or Invoice (financed) per funded deal; Bills for cost adds; JournalEntry for flooring payoff; reversing entries on void/unwind (originals never deleted); WIP→COGS transfer at deal close.
**Second cut (daily reconcile):** Vercel Cron at 2am, pull QBO entities updated last 24h, flag mismatches in `QboReconciliationFlag`; refresh-token-near-expiry alert.
**Uses:** `intuit-oauth` + raw fetch (avoid callback-style `node-quickbooks`); jobs queue.
**Avoids:** Rounding accumulation (integer cents; assert sum-of-lines = deal-total before push), tax misallocation (state vs county to separate liability accounts), unreversed voided deals, cost adds posted to wrong period (WIP→COGS at close), rate-limit/token-refresh silent failures.
**Compliance gate:** Accountant defines chart-of-accounts mapping (one-hour conversation, not a code problem) before code starts. Done as a Phase 6/7 prerequisite.

### Phase 8: Reporting + AI Reporting
**Rationale:** Right-tail. Depends on most domain data existing in canonical shape. Building it earlier means rewriting prompts/schemas.
**Delivers:** Canned reports (inventory aging with cost-to-keep-per-day, gross by unit/source, sales by rep, flooring exposure, days-to-sell, deal lifecycle, F&I penetration, tax liability snapshot, unwound deals, activity-log filtered views, audit CSV/PDF exports); extended `AskAI` natural-language ad-hoc reports over the DMS data model; anomaly summaries; conversational deal-prep brief; weekly digest auto-emailed; saved AI queries promotable to canned reports; drill-down report → vehicle → activity log → message.
**Uses:** Existing Anthropic SDK + `@xenova/transformers`; jobs queue for digest email.
**Avoids:** 200 canned reports (DealerCenter's failure mode — 15 + great ad-hoc beats 200), PDF dashboards as primary delivery, ML forecasting with insufficient data volume (restrict AI to summarization/anomaly/ad-hoc; no predictions).

### Cutover Milestone (separate from Phase 8)
**Rationale:** Dual-entry too long causes data drift; mid-deal cutover strands customers.
**Delivers:** Dual-entry capped at 1–2 weeks; daily reconciliation showing < 5% delta for 5 consecutive business days before cutover; DealerCenter goes read-only on a pre-announced date; existing open deals complete in DealerCenter (no mid-deal migration); 60-day "started-in-DealerCenter" pathway; 24-month historical import (read-only, `source='dealercenter_import'`, no workflow side effects); rollback rehearsed on a copy of production data; Capacitor min-version check forces app update on launch.

### Phase Ordering Rationale

- **Phase 0 first** — every later phase attaches to canonical vehicle; rebuilding around two-table identity is impossible.
- **Phase 1a + 1b split out** (callout #2) — RBAC and jobs are cross-cutting infra called by Phases 4–8; building once is cheaper than retrofitting.
- **Phase 2 (inventory core) before Phase 4 (deal desk)** — CostAdd + flooring math feed gross-profit calc.
- **Phase 3 (media) before Phase 4** — marketing syndication's "ready-to-list" gate is a deal-desk prerequisite; also the `MediaAsset` backfill is cheaper before deal-desk traffic ramps.
- **Phase 5 (docs + e-sign) before Phase 6 (credit)** — FCRA consent is itself a signed document; Phase 6 cannot start without Phase 5's e-sign pipeline.
- **Phase 7 (QBO) push-only before reconcile** — gets working sync to production faster, lower-risk first ship.
- **Phase 8 (reporting + AI) last** — depends on full data model being stable.

### Research Flags

**Phases likely needing deeper research during planning (recommend `/gsd:research-phase`):**

- **Phase 0 — Vehicle Unification.** Strategy A vs Strategy B confirmation; FK inventory across schema; Prisma 6 raw-SQL migration patterns for `CREATE UNIQUE INDEX CONCURRENTLY`; Supabase Postgres version verification; Capacitor iOS cache-bust strategy.
- **Phase 4 — Deal Desk.** FL deal-math rule confirmation (surtax cap, sourcing rule, doc-fee taxability, trade-in credit treatment) with accountant. HSMV form numbers and field requirements with title clerk. Wholesale + consignment day-one scope confirmation.
- **Phase 5 — Documents + E-Sign.** Provider final selection (BoldSign vs Anvil — current pricing/embedded API parity verification). HSMV PDF audit (AcroForm vs XFA — one-time pre-flight). Attorney review of ESIGN consent language + Buyers Guide + HSMV templates. Spanish-language packet scope.
- **Phase 6 — Credit.** Provider final selection (700Credit vs eLEND onboarding timing; both should be applied to in parallel during Phase 0/1). Attorney review of FCRA permissible-purpose flow + adverse-action timeline + GLBA privacy notice. SSN-flow architecture (provider iframe vs client-direct-to-provider API).
- **Phase 7 — QBO.** Chart-of-accounts mapping with accountant. Current QBO OAuth refresh-token TTL and rate-limit verification. CSV-vs-API trade-off re-confirmation (already locked to API but verify pricing/onboarding hasn't shifted).
- **Cutover milestone.** Dual-entry window length; historical-import design; rollback rehearsal scope.

**Phases with standard patterns (lighter research, follow architecture):**

- **Phase 1a — RBAC.** Plain tables + key strings; well-trodden path; no library research needed.
- **Phase 1b — Jobs/infra.** `FOR UPDATE SKIP LOCKED` pattern is well-documented; storage consolidation is grep + rewrite.
- **Phase 2 — Inventory Core.** vPIC integration is straightforward government REST. DataOne research deferred until pricing quote received.
- **Phase 3 — Media.** Migrating `Vehicle.photos[]` to `MediaAsset` is a straightforward backfill; UploadLink + R2 infrastructure already exists.
- **Phase 8 — Reporting + AI.** `AskAI` extension is incremental; canned reports are SQL.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH on patterns; LOW on specific 2026 provider pricing | `pdf-lib`, vPIC, FL-build-don't-buy, Vercel Cron + DB jobs, Vitest — HIGH (training data + stable). BoldSign/Anvil/700Credit/eLEND/DataOne pricing — LOW; verify on live pricing pages before contract. WebSearch was unavailable this session. |
| Features | MEDIUM-HIGH overall; LOW on FL-specific rates and form numbers | Domain table-stakes / differentiators / anti-features are HIGH-confidence (well-documented DMS / used-car practice). FL discretionary surtax cap, HSMV form numbers, doc-fee taxability, FTC Buyers Guide template version, insurance minimums — all LOW; require accountant/attorney/title-clerk verification. |
| Architecture | HIGH on shape; MEDIUM on specific library versions and Vercel limits | Modular monolith inside Next.js, provider adapters, state-machine pattern, `prisma.$transaction` + ActivityLog write, separate `CreditAccessLog` for GLBA — HIGH. Vercel Cron minimum interval, Prisma 6 migration syntax for embedded raw SQL, QBO OAuth refresh-token TTL, CASL current state — MEDIUM; verify before locking. |
| Pitfalls | HIGH on structural patterns; LOW on specific FL statute citations | Consent flow, audit integrity, mapping tables, snapshot patterns, integer-cent math, dual-entry caps, SSN-never-server, separate CreditAccessLog — HIGH (regulatory bodies of law + DMS practice). Specific FL statute citations, ECOA/FCRA exact timelines, HSMV form numbers, dealer recordkeeping retention — LOW; attorney verification required. |

**Overall confidence:** MEDIUM-HIGH on architecture, build/buy posture, phase ordering, and structural pitfalls. LOW on specific provider pricing (2026 verification needed) and FL statutory specifics (attorney/accountant verification needed before encoding into Phase 4–6 code).

### Gaps to Address

- **Phase 0 strategy disagreement with PROJECT.md** — get explicit user confirmation on Strategy A (keep `Vehicle.id`) before kicking off Phase 0 planning.
- **Provider final selections** — BoldSign vs Anvil, 700Credit vs eLEND, DataOne quote vs Chrome Data quote — all deferred per PROJECT.md. Schedule live pricing/API verification at the start of the phase that uses each (5, 6, 2 respectively).
- **FL statutory specifics** — accountant call (surtax cap, doc-fee taxability, sourcing rule, trade-in credit, tax-exempt forms) before Phase 4 code. Attorney call (ESIGN consent language, Buyers Guide, adverse-action timeline, FCRA permissible-purpose flow, GLBA privacy notice, HSMV form numbers + revisions, FL dealer recordkeeping retention) before Phase 5 / 6 code.
- **Chart-of-accounts mapping** — accountant conversation before Phase 7. One-hour task; not a code problem; produces the `AccountingMapping` seed data.
- **HSMV form audit** — one-time pre-flight at Phase 5 start: load every required PDF in `pdf-lib`, list AcroForm fields, flag XFA-only forms that need overlay-coordinate fallback.
- **Wholesale + consignment day-one scope** — does Mikalyzed do wholesale dispositions today? Consignment intake? Determines whether Phase 4 needs both flows on day one or as sub-phases.
- **Spanish-language packet day-one need** — real FL customer mix concern; if day-one, Phase 5 template work doubles.
- **Background-job queue future migration** — Vercel Cron + DB is fine for v1; revisit Inngest only if Phase 7 surfaces real throughput pain.

---

## Sources

### Primary (HIGH confidence)

- `/Users/fernandoballadares/mikalyzed-management/.planning/PROJECT.md` — locked decisions, build-vs-integrate posture, scope boundaries
- `/Users/fernandoballadares/mikalyzed-management/.planning/codebase/STACK.md` (referenced) — baseline tech context (Next.js 15, Prisma 6, Postgres, R2, Cloudinary, Twilio, Graph, Anthropic, Capacitor)
- NHTSA vPIC `DecodeVinValuesExtended` — stable government API for free VIN decode
- `pdf-lib` — de-facto pure-JS PDF AcroForm fill in Node ecosystem
- ESIGN / UETA / FCRA / GLBA / FTC Used Car Rule — bodies of law (general structural posture HIGH; specific timelines and template versions LOW)

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — provider rankings, install commands, alternatives-considered matrix (training data only — WebSearch unavailable this session)
- `.planning/research/FEATURES.md` — table-stakes / differentiators / anti-features per DMS domain (DMS / FL retail practice from training data)
- `.planning/research/ARCHITECTURE.md` — modular monolith, provider adapter pattern, state machine + ActivityLog + idempotent webhooks, Phase 0 migration plan (Strategy A vs B), RBAC tables, separate CreditAccessLog, Vercel Cron + DB jobs
- `.planning/research/PITFALLS.md` — 11 pitfall domains with Critical / Moderate / Minor + prevention strategies

### Tertiary (LOW confidence — verification required before encoding)

- BoldSign vs Anvil vs Dropbox Sign 2026 pricing — verify on live pricing pages
- 700Credit vs eLEND 2026 onboarding lead time and API posture — apply in parallel during Phase 0/1
- DataOne Vehicle Database API pricing — quote needed at Phase 2 start
- QBO API current OAuth refresh-token TTL (cited 100 days from memory) and rate-limit posture — verify at Phase 7 start
- Vercel Cron minimum interval (believed 1 min on Pro plan) — verify your plan
- Vercel serverless function timeout for the job runner (~30s+ for QBO calls) — verify
- Supabase Postgres version for `CREATE UNIQUE INDEX CONCURRENTLY` raw SQL syntax
- Prisma 6 migration syntax for embedded raw SQL
- CASL current version + Next.js 15 compatibility (if record-level rules emerge)
- FL discretionary sales surtax cap on motor vehicles (historically $5,000)
- FL doc-fee taxable status with FL DOR / accountant
- FL trade-in tax credit treatment (current law)
- FL surtax sourcing rule for motor vehicles (purchaser's county of registration)
- HSMV form numbers (82040 / 82042 / 82139 / 82994) and current revisions
- ECOA / FCRA adverse-action timelines with attorney
- FL dealer recordkeeping retention period (default 5 years pending verification)
- FL insurance minimums for delivery ($10K PIP + $10K PDL — confirm)
- Federal odometer disclosure model-year threshold (rule changed recently)
- FTC Buyers Guide template version (Spanish required when negotiation in Spanish)
- FL sales-tax exemption form references (DR-123 for nonresident buyers)

**Session constraint:** WebSearch, WebFetch, Context7, and Bash were unavailable during the four research runs that produced STACK / FEATURES / ARCHITECTURE / PITFALLS. Every "verify before locking" note in those files is genuinely necessary — the user (or a follow-up research run with tool access) must hit each provider's live pricing/API pages and book the attorney/accountant verifications before any contract is signed or compliance code is encoded.

---
*Research completed: 2026-06-02*
*Ready for roadmap: yes — flag the Phase 0 strategy disagreement (callout #1) and the Phase 1 split (callout #2) for user confirmation before roadmap kickoff.*
