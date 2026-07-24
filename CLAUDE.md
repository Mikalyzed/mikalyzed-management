# CLAUDE.md — Mikalyzed Management / DMS

> Source-of-truth onboarding + working guide for this repo. Written for both AI agents (Claude Code) and human collaborators.
> **This file is verified against the actual codebase, not the planning docs.** Where `.planning/` and the code disagree, the code wins and the divergence is called out below.
> Last verified against code: 2026-07-24.

---

## 1. What this is

A full **Dealer Management System (DMS)** for Mikalyzed Auto Boutique, being built to replace DealerCenter. It is a live, production Next.js app that already runs the dealership's day-to-day: vehicle reconditioning, inventory, parts, external repairs, scheduling (mechanic / content / porter / transport), a sales CRM, a unified messaging inbox (SMS + voice + Instagram + email), media pipeline, AI helpers, and a **Deal Desk** (retail-cash + wholesale deals: OTD worksheet with FL tax engine, deal jacket, contract page, stipulations).

**Core value:** one canonical vehicle record drives the entire dealership — every cost, photo, conversation, deal, document, and credit pull attaches to that one record, and every mutation is logged with who did it (`ActivityLog`).

Single-tenant (Mikalyzed only). Solo developer + operator today; this doc exists so additional collaborators can align.

---

## 2. Stack & how to run

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15.5 (App Router, Turbopack), React 18.3, TypeScript 5.9 |
| Styling | Tailwind CSS 4 (+ `@tailwindcss/postcss`). **No component library — UI is hand-rolled inline styles.** |
| DB / ORM | Postgres (Supabase-hosted) via Prisma 6.19 |
| Auth | Custom cookie session (`mm_user_id`), role-string RBAC. **Not** NextAuth/Clerk (`clerkId` column is vestigial). |
| Mobile | Capacitor 8 iOS wrapper → TestFlight (bundle `com.mikalyzed.mgmt`) |
| Hosting | Vercel (auto-deploys on push to `main`) |

**Scripts** (`package.json`):
- `npm run dev` — Next dev server (Turbopack) on :3000
- `npm run build` — `prisma generate && next build`
- `npm run start` — production server
- `npm run cap:dev` — sync iOS pointing at **localhost** (`CAP_ENV=dev`)
- `npm run cap:prod` — sync iOS pointing at **Vercel** (`CAP_ENV=prod`) — **always run before an Xcode Archive**
- `npm run ios:open` / `ios:sync` — open / sync the iOS project

There is **no test script and no lint script.** The TypeScript compiler is the only automated quality gate today (see §8 gaps). Migration/data scripts are run ad-hoc via `npx tsx scripts/...`.

**Env** lives in `.env`. Migrations need `DIRECT_URL` (direct Postgres); the pooled `DATABASE_URL` hangs `prisma migrate`. **Migration workflow** (non-TTY `migrate dev` is blocked; history was repaired 2026-07-23 and is clean): generate SQL with `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `prisma migrate deploy`, then `prisma generate`. After every `prisma generate`, restart the dev server (stale client causes 500s). Key vars: `DATABASE_URL`, `DIRECT_URL`, `ANTHROPIC_API_KEY`, Twilio (`TWILIO_*`), Microsoft Graph (`MS_*`), Meta/Instagram (`IG_*`/`META_*`), R2 (`R2_*`), `CLOUDINARY_*`, `RESEND_API_KEY`, `DMS_READ_CANONICAL_VEHICLE`.

**Local recovery:** if localhost 500s but `npm run build` passes, the dev server is holding stale state — `kill` the :3000 process, `rm -rf .next`, then `npm run dev`.

---

## 3. Architecture & conventions

- **App Router**, two route groups:
  - `app/(app)/*` — authenticated screens; `(app)/layout.tsx` mounts the role-based `Nav` (collapsible icon rail), the global `VoicePhone` softphone, the global `AskAI` dialog, and the mesh-gradient backdrop. Two layout modes live here too: **deal focus** (the contract page adds `deal-focus` to `<html>`, hiding the global sidebar in favor of a deal-scoped rail) and **embedded** (`window.self !== window.top` → chrome-free render, used by the deal page's peek-modal iframes).
  - Public routes outside the group: `/login`, `/tv` (shop display board), `/u/[token]` (tokenless customer upload portal), `/privacy`, `/terms`, `/data-deletion-status`.
- **API routes** live under `app/api/*`. Each route enforces its own auth — see below.
- **Auth enforcement** ([middleware.ts](middleware.ts) + [lib/auth.ts](lib/auth.ts)):
  - Middleware only redirects **page** requests without an `mm_user_id` cookie to `/login`. It does **not** block `/api/*` — every API route must call `getSessionUser()` + `requireRole(...)` itself. `requireRole` treats `admin` as always-allowed. `canSeeAllLeads` / `canAccessOpportunity` gate CRM visibility.
  - Public/webhook bypass list is in `middleware.ts` (Twilio, Instagram, email webhooks, `/u/*`, upload-links, legal pages).
- **Domain logic in `lib/`**, not in components. Notifications, CRM constants, recon flow, integrations, formatting all live here.
- **Roles** are plain strings (not a Prisma enum), enumerated in `lib/constants.ts`: `admin, mechanic, detailer, content, sales, sales_manager, coordinator, porter`.
- **Big files are the norm.** `vehicles/[id]/page.tsx` is ~8,300 lines; recon board ~3,000; mechanic schedule ~3,000. New work should avoid making these worse — extract components where practical.
- **Prisma schema is the source of truth** — ~55 models, `prisma/schema.prisma`.

---

## 4. Data model (real state)

`prisma/schema.prisma`, grouped. Full model list is in the schema; highlights:

**Vehicle / recon (the spine)**
- `Vehicle` — **canonical** vehicle. Already absorbed the former InventoryVehicle scalars (cost, price, `purchaseType`, `titleStatus`, `dateInStock`, `inventoryStatus`, consignment %) **plus inline flooring fields** (`floorLender`, `floorPrincipal`, `floorDailyRate`, `floorAdvanceDate`, `floorStatus`). Carries both a recon `status` and an `inventoryStatus`. Has VIN-dup self-relation (`priorVehicleId`) and audit bridges (`legacyInventoryVehicleId`, `legacyVehicleId`).
- `InventoryVehicle` — **legacy** DealerCenter mirror. Cut over (§6) — retained read-only as a rollback net until ~2026-08-15, then decommission.
- `VehicleMigrationMap` — audit map: legacy Vehicle + InventoryVehicle → canonical Vehicle.
- `VehicleStage`, `Part`, `MechanicTimeLog`, `ExternalRepair`, `Vendor`, `TaskApproval`, `StageConfig`/`ChecklistTemplate`/`StageTemplate`, `WeeklyPlanSnapshot`.
- `MediaAsset` — typed R2-backed media (exterior/interior/video/doc) per vehicle. (`Vehicle.photos[]` still exists but is vestigial.)
- `CostAdd` (+ `CostAddCategory`, `CostAddDescription`) — itemized costs rolling into true cost. `Partner` — vendors/lenders/lienholders/insurance/repo.
- `Vehicle` also carries deal-era spec columns (`engine`, `transmission`, `driveTrain`, `titleBrand`, `newUsed`) and `purchasedFromContactId`, editable from the deal jacket.

**Deals (Phase 4, live)**
- `Deal` — one row per deal. `dealNumber` (autoincrement, displayed via `formatDealNumber`), `status` draft/funded/cancelled, `dealType` retail_cash/wholesale, nullable `buyerContactId` (retail) **or** `businessBuyerId` (wholesale), `lienholderPartnerId`, sale/tax fields (`salePrice`, `collectTax`, `stateTaxRate` .06, `countySurtaxRate` auto-set from buyer's county, `surtaxCap` 5000, `taxAmount`, `depositCredit`, `otdTotal`), financing terms (`termMonths`/`apr`/`firstPaymentDays`), `commissions`, lifecycle timestamps (`proceededAt`/`fundedAt`/`cancelledAt`). Funding marks the vehicle sold in-transaction with a double-funding guard.
- `DealLineItem` — fees/accessories/add-ons: category/label/amount/taxable + `cost`, `itemNumber`, `vendorPartnerId`, `deductFrom`.
- `DealTrade` — up to 4 trade-ins per deal (vin/year/make/model/mileage/allowance/acv/payoff/lienholder).
- `Business` — wholesale buyer entity (~40 cols: identity, enterprise type, address, fleet/underwriting, operator, principal). Separate from `Contact`.
- `DealStipulation` / `StipTemplate` — requested docs per deal (buyer/co-buyer flags, pending/received, sent via SMS or email with a 7-day tokenized `/u/` upload link) + saved custom stip templates.
- All deal math lives in `lib/deals.ts` (single source): `computeDealTotals`, `computeFinancing`, `computeDealProfit`, `FL_COUNTY_SURTAX` (all 67 counties; **rates must never be hand-edited without accountant verification** — see the file header for the FL DOR source), `FL_DEFAULT_FEES`, `DEFAULT_STIPS`.
- Deal/business APIs are gated `requireRole(role, ['sales_manager'])` (admin implicit); customers API is gated `['sales','sales_manager']`.

**Ops** — `TransportRequest`, `PorterEntry`/`PorterTask`, `Task`, `CalendarItem`/`CalendarAssignee`, `Event`/`EventSection`/`EventTask`.

**CRM** — `Pipeline`/`PipelineStage`, `Contact` (leads/customers/vendors; includes DealerCenter-style buyer fields incl. SSN/employment inline, plus ~28 applicant columns added for the deal jacket: salutation/middle name/suffix/county/prev-address/2 employment blocks/co-buyer relationship), `Opportunity` (+ notes/tasks), `ActivityEvent`, `VehicleInterest`, `Disposition`/`DispositionStageRule`/`DispositionLog`, `RoundRobinState`/`RoundRobinWeight`, `LeadSource`.

**Messaging** — `Message` (unified sms/email/instagram/whatsapp), `Call` (Twilio voice log), `EmailSubscription` (Graph webhook per mailbox), `UploadLink` (tokenized public uploads), `ConnectedInstagramAccount`.

**Cross-cutting** — `Notification`, `ActivityLog` (generic polymorphic audit sink), `User`.

**Models that do NOT exist yet** (planned, see §7): `Document`/`DocumentTemplate`, `CreditApplication`/`CreditPull`, QBO sync models, `Job`/`JobAttempt` queue, `Permission`/`RolePermission`/`UserPermission`.

---

## 5. Integrations (real state)

All wrapped in `lib/`, config-guarded (no-op / 503 when keys are absent):

| Service | Module | State |
|---------|--------|-------|
| Twilio SMS/MMS | `lib/twilio.ts`, `lib/twilio-validate.ts` (HMAC verify) | Live. Per-rep `from` number. Also sends deal stip-request SMS (dedicated admin-sales number planned — single swap point in `app/api/deals/[id]/stips`). |
| Twilio Voice (WebRTC softphone) | `app/api/voice/*`, `components/VoicePhone` | Live. Token, TwiML, inbound, recording, transcription, voicemail. |
| Microsoft Graph / Outlook | `lib/graph.ts` (raw `fetch`, no SDK) | Live. Send-as-user + inbox webhooks + subscription renewal. |
| Meta / Instagram DMs | `app/api/instagram/*`, `lib/meta-signed-request.ts` | Built (OAuth, webhooks, data-deletion) but **paused** mid-debug. |
| Anthropic Claude | `app/api/inventory/ask`, `app/api/ai/polish-description`, `app/api/fetch-listing`, `app/api/generate-ad` | Live. 3–4 endpoints. |
| Xenova transformers | `app/api/generate-ad` | Object detection (DETR) to center vehicle in generated ads — **not** general embeddings. |
| Cloudflare R2 | `lib/r2.ts` (`@aws-sdk/client-s3`) | Live. Presigned PUT/GET + multipart for large uploads. |
| Cloudinary | `lib/cloudinary.ts` | Live. MMS media delivery. |
| Resend | `lib/email.ts`, `lib/email-templates.ts` | Live. Notification emails + deal stip-request emails (management@ address; dedicated admin-sales mailbox planned). |
| Supabase | `lib/supabase.ts` | Postgres host + service client. |

---

## 6. The in-flight vehicle unification (most important architectural fact)

A single physical car currently can exist in two tables: canonical `Vehicle` and legacy `InventoryVehicle`. The unification is **mid-migration, gated by a feature flag**:

- `lib/dms/feature-flags.ts` → `DMS_READ_CANONICAL_VEHICLE` (env var; **`true` in production as of 2026-07-16**).
- `lib/dms/vehicle/canonical-reader.ts` / `canonical-writer.ts` route reads/writes to the legacy or canonical table based on that flag. Only 4 routes consume the shim: `app/api/inventory`, `app/api/inventory/ask`, `app/api/vehicles`, `app/api/vehicles/resolve`.
- Backfill + verification tooling: `scripts/dms/*` (`backfill-canonical-vehicle.ts`, `verify-backfill.ts`, `resync-inventory-status.ts`, orphan finders, reconcile-with-dealercenter, etc.), most support `--dry-run` / `--commit` (resync uses `--apply`).

**Status (2026-07-16): CUT OVER.** The flag is now `true` in production — reads *and* writes go to the canonical `Vehicle` table. Before the flip, a `resync-inventory-status.ts --apply` corrected 37 drifted statuses and `verify-backfill` passed clean (0 issues, 0 orphan opportunities). The cutover also surfaced ~16 recon-added cars that were never in the legacy DealerCenter mirror — they now show correctly in inventory. `InventoryVehicle` is **retained as a read-only rollback net until ~2026-08-15**, then decommission (drop legacy writes/table, backfill the sold `N044451` Twingo VIN-match quirk). To roll back before then: remove the env var + redeploy.

---

## 7. Roadmap — what's planned, with REAL status

The `.planning/ROADMAP.md` defines a 10-phase plan to fully replace DealerCenter. **Its status table is stale.** Below is the reconciled view (code = truth). Note that work has shipped **out of phase order** — the "Phase 0 hard gate" was not honored in practice; inventory (2) and media (3) schema/features landed before the Phase 0 flag cutover.

| Phase | Planned scope | Real status (from code) |
|-------|---------------|--------------------------|
| **0. Vehicle Identity Unification** | One canonical `Vehicle`; decommission `InventoryVehicle` | **Cut over 2026-07-16** (§6). Legacy table retained read-only until ~2026-08-15, then decommission. |
| **1a. RBAC upgrade** | `Permission`/`RolePermission`/`UserPermission` + `requireCan()` | **Not started.** Still role-string `requireRole`. |
| **1b. Background jobs + storage consolidation** | `Job`/`JobAttempt` + Vercel Cron runner; consolidate to R2 | **Not started.** No job queue. |
| **2. Inventory Core** | CostAdd, flooring accrual, VIN intake, vendor sourcing, aging | **Largely shipped ahead of plan.** `CostAdd`, flooring fields, `Partner`, VIN decode, inventory aging all exist. Flooring *accrual job* not built (needs 1b). |
| **3. Media System + syndication** | Typed `MediaAsset`, send-content popup, channel syndication | **Partially shipped.** `MediaAsset` exists; marketing syndication (`MarketingPlacement`) not built. |
| **4. Deal Desk** | `Deal` model + FL tax/fee math + trades + worksheet | **Largely shipped (2026-07-24).** Retail-cash + wholesale deals: DC-parity deal jacket (`/deals/[id]`), contract/finalize page with deal-focus rail, FL tax engine (6% state + auto county surtax, out-of-state = no tax), auto FL fee sheet, up to 4 trades, real front/back gross from `vehicleCost`+`CostAdd`s, financing-terms calculator, stipulations w/ SMS/email upload links, fund/cancel lifecycle. **Not yet:** payments/deposits, Notes/Files/Journal tabs, wholesale direct-create, sales-rep on deal, mobile layouts. Surtax baseline + fee taxability still need accountant verification. |
| **5. Documents + E-Signature** | pdf-lib prefill + BoldSign/Anvil embedded signing | **Not started.** Attorney sign-off required before go-live. |
| **6. Credit Applications** | 700Credit/eLEND adapter, no local SSN/DOB, audit log | **Not started.** Attorney sign-off required before go-live. |
| **7. QuickBooks Online sync** | Push funded deals/costs to QBO | **Not started.** Needs accountant chart-of-accounts mapping. |
| **8. Reporting + AI reporting** | Canned reports + AskAI over full DMS model | **Thin today.** `reports/page.tsx` is basic totals; AskAI over inventory exists. |
| **9. Cutover & Go-Live** | Dual-entry, historical import, runbook, sign-off | **Not started.** |

**Locked product decisions** (from `.planning/PROJECT.md`, still valid):
- Keep `Vehicle.id` canonical (Strategy A); absorb InventoryVehicle fields. ✓ done in schema.
- Cash + outside-financing only — **no in-house/BHPH** (avoids Reg Z/TILA scope).
- `Contact.contactType` promotes lead → customer; **no separate Customer table.**
- **Integrate, don't build,** the regulated pieces: credit (700Credit/eLEND), e-sign (BoldSign/Anvil), accounting (QuickBooks), VIN trim/options (paid provider).
- Phases 5 & 6 require **written attorney sign-off in `.planning/`** before their feature flag flips on in production.

---

## 8. Known gaps & tech debt (from the codebase map)

- **No automated tests, no lint.** TypeScript compiler is the only gate. A testing strategy needs to be defined as DMS scope grows (deal/document/credit flows cannot tolerate silent failures).
- **Silent error swallowing** in fire-and-forget integration calls (notifications, webhooks). Fine for recon; unacceptable for money/legal flows.
- **Uneven webhook signature validation** — Twilio validation exists (`twilio-validate.ts`) but isn't uniformly enforced; Instagram has bypass paths; Graph `clientState` verification needs a cross-check.
- **Mega page files** (`vehicles/[id]`, mechanic schedule, conversations, leads, deal jacket `deals/[id]` ~2,600 lines) — extract as you touch them.
- **Deal-desk deferred debt** (known, accepted at review time): chained round-trips in jacket save helpers, heavy `DEAL_DETAIL_INCLUDE` refetched on every PATCH, deals list `take: 200` with no pagination, 4 copies of contact-search pickers, `dealAccess` helper duplicated across deal routes. Batch these when touching the deal desk next.
- **No background job queue, no APM, no rate limiting, no audit trail beyond `ActivityLog`.**
- **`vehicles/[id]/v1/page.tsx`** is a retained legacy detail page — redundant.
- **Known data paper-cuts:** DealerCenter CSV import can't distinguish "sold" from "deleted" (both marked sold); stale `returnQueue` entries can produce wrong "Returns to X" labels; a couple of customer-owned storage cars have no home (a Storage tab is planned).

---

## 9. Working conventions (house rules)

**Process**
- **Never `git commit` / `git push` without explicit confirmation** — the operator tests locally first. Branch before committing if on `main`.
- **Schema before code on deploys:** apply the Prisma migration to the prod DB *before* pushing the schema commit — Vercel auto-deploys and will break queries otherwise.
- **Data-fix scope discipline:** when authorized to fix specific rows, fix only those. If the same bug pattern exists elsewhere, list the other rows and ask — never generalize the fix silently.
- **Destructive actions never sit one click away** — use overflow menus, edit-mode, or confirmation. Same for delete UI.
- **Clarify scope (mobile / desktop / both)** before editing UI when the request doesn't say.

**Product / UX**
- Match the surrounding **spacing, padding, and rhythm** of any screen you add to — no cramped tacked-on fields.
- Native-feeling polish is the bar: **custom dropdowns (not native `<select>`), slide-up sheets, multi-select filters.**
- **AI features must stay grounded in real user input + system data.** Never invent vehicle specs, history, or condition — false-advertising risk. The inventory AskAI already reads only from the canonical vehicle data; keep new AI features grounded the same way.

**GSD planning system**
- `.planning/` is managed by the GSD workflow (`/gsd:*` skills). Treat ROADMAP/REQUIREMENTS as a **completeness checklist, not a strict sequence** — work ships out of order and `STATE.md` drifts. Verify against code, and prefer this file's §7 for real status.

---

## 10. Where to look first

| I want to… | Start at |
|------------|----------|
| Understand the data model | `prisma/schema.prisma` |
| See the recon workflow | `app/(app)/vehicles/page.tsx` (board), `vehicles/[id]/page.tsx` (detail) |
| Understand auth/RBAC | `lib/auth.ts`, `lib/constants.ts`, `middleware.ts` |
| Add an integration | `lib/` (mirror `twilio.ts` / `graph.ts` / `r2.ts` patterns) |
| Work on the vehicle migration | `lib/dms/`, `scripts/dms/` |
| Work on the Deal Desk | `app/(app)/deals` (list), `deals/[id]` (jacket), `deals/[id]/finalize` (contract); `lib/deals.ts` (all math + FL tax); `app/api/deals`, `app/api/businesses` |
| See the sales CRM | `app/(app)/leads`, `contacts`, `customers`, `pipelines`; `lib/crm.ts` |
| Messaging inbox | `app/(app)/conversations`, `app/api/{messages,sms,instagram,voice,email}` |
| Roadmap / product context | `.planning/PROJECT.md`, `.planning/ROADMAP.md` (status stale — see §7) |
