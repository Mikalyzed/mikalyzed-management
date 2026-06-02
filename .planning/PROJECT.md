# Mikalyzed DMS

## What This Is

A full dealership management system replacing DealerCenter for Mikalyzed — an in-house tool that unifies vehicle reconditioning, inventory, sales pipeline, deal desk, documents/e-signature, credit applications, accounting sync, and reporting on top of the existing Next.js 15 + Prisma + Postgres app already in production. Built as the single source of truth for every vehicle the dealership touches, from acquisition through retail or wholesale disposition.

## Core Value

**One canonical vehicle record drives the entire dealership.** Every cost, photo, conversation, deal, document, and credit pull attaches to that one record — and every action is logged with who did it. If this fails, the DMS isn't a DMS, it's just a CRM with extra tables.

## Requirements

### Validated

<!-- Existing, shipped capabilities (inferred from codebase map) -->

- ✓ Vehicle reconditioning workflow — stages (mechanic → detailing → content → publish), checklist-as-data, parts tracking, approval flow — existing
- ✓ Lead/contact CRM — `Contact.contactType` (lead/customer/vendor), Opportunity + Pipeline + Disposition, round-robin lead assignment — existing
- ✓ Unified messaging inbox — Twilio voice + SMS/MMS, M365 Outlook email (per-user OAuth), Instagram DMs (paused mid-debug) — existing
- ✓ Generic activity log — `ActivityLog` (polymorphic: entityType + entityId + action + actorId + details JSON) — existing
- ✓ Media upload pipeline — `UploadLink` + multipart S3/R2, Cloudinary, sharp/canvas for derivatives — existing
- ✓ AI foundation — Anthropic SDK, `@xenova/transformers` embeddings, `/api/inventory/ask`, `AskAI` widget — existing
- ✓ DealerCenter inventory mirror — `InventoryVehicle` with cost/price/purchaseType/titleStatus — existing (but unlinked)
- ✓ Custom cookie-based auth + RBAC — `mm_user_id`, `requireRole`, role enum (admin/mechanic/detailer/content/sales/sales_manager/coordinator/porter) — existing (needs upgrade for DMS scope)
- ✓ TV board, calendar, tasks, notifications, vehicle interest tracking — existing
- ✓ Public Privacy Policy + Terms of Service (Meta App Review) — existing
- ✓ Capacitor iOS wrapper with TestFlight internal testing — existing

### Active

<!-- v1 scope — DMS replacement. Building toward these. -->

- [ ] Unify `Vehicle` and `InventoryVehicle` into one canonical vehicle record with relations to recon, opportunities, costs, media, deals, documents
- [ ] Upgrade RBAC from single role string to per-module permissions; preserve existing role enum and helpers
- [ ] Establish `ActivityLog` as the single accountability sink — every DMS mutation writes a log entry with actor
- [ ] Inventory core: `CostAdd` (itemized costs rolling into true cost), flooring accrual (skip for consignment), purchase source via `Contact(contactType=vendor)`, VIN intake (vPIC free + paid provider for trim/options), surfaced activity log on vehicle
- [ ] Media system upgrade: `MediaAsset` model (typed: exterior / interior / undercarriage / walkaround video / turntable video / docs), ordered; replaces `Vehicle.photos[]`; sales "send content" popup with shareable links
- [ ] Customer + marketing: contact auto-promotes from lead → customer when deal starts (no new Customer table); marketing channel syndication (price, photos, status)
- [ ] Deal desk: `Deal` model linking Contact + canonical vehicle + trade-ins; supports purchase / trade-in / consignment intake and retail (cash / customer-arranged finance) / wholesale disposition; computes FL tax + fees, trade allowance + payoff, consignment commission %, flooring payoff, cost adds → gross profit; won Opportunity spawns/links a Deal
- [ ] Document system (BUILD prefill + INTEGRATE embedded e-sign): PDF prefill via pdf-lib for cash/outside-financing doc set (purchase agreement, deposit, bill of sale, FTC Buyers Guide + as-is, federal odometer disclosure, FL HSMV forms, POA, privacy notice); embedded signing via BoldSign or Anvil; `Document` model stores signed packets + audit certificates in R2; files tab on vehicle (receipts, titles, registrations)
- [ ] Credit applications (INTEGRATE 700Credit or eLEND CreditPlus): soft-pull prequal → hard-pull on real deals; `CreditApplication` + `CreditPull` models store provider references and compliance doc URLs only — no SSN/DOB locally; webhook returns score/decision/adverse-action artifacts
- [ ] QuickBooks Online integration: sync funded deals, cost adds, flooring payoffs to QBO entries; no manual re-entry
- [ ] Reporting library + AI reporting: canned reports (inventory aging, gross by unit/source, flooring exposure, sales by rep) + extended `AskAI` for natural-language custom reports across the full DMS data model
- [ ] Compliance gates per phase: ESIGN/UETA consent capture; FCRA permissible-purpose logging; GLBA Safeguards (encryption at rest, RBAC on credit/customer PII, audit logging of who views credit records); odometer + Buyers Guide on every retail deal; FL doc-fee + tax disclosure

### Out of Scope

<!-- Explicit boundaries. Reasoning included to prevent re-adding. -->

- In-house / BHPH financing (retail installment contracts) — opens Reg Z/TILA scope and requires licensed RIC forms; user has decided cash + outside financing only
- Self-hand-rolled credit bureau integration — bureau access requires being an authorized reseller (FCRA credentialing + on-site inspection); compliance liability stays with reseller (700Credit)
- Self-hand-rolled e-signature execution (cryptographic seal, trusted timestamp, completion certificate) — server-generated timestamps are self-serving evidence and fail in dispute; rent BoldSign/Anvil
- Real-time WebSocket layer — current polling pattern stays; not a v1 blocker
- Multi-tenant / multi-dealer support — single-tenant for Mikalyzed; multi-tenant is a separate future track
- New Customer table (separate from Contact) — `Contact.contactType` already supports the lead→customer transition
- Replacing the existing recon stage workflow — phase 0 re-points it at the canonical vehicle, doesn't rebuild it
- Mobile-first Sales app and mobile Instagram DMs — explicitly paused per current direction; DMS-first
- New activity log system — `ActivityLog` is the sink; DMS writes to it, doesn't replace it

## Context

**Business situation:**
- Single-dealer (Mikalyzed) usage; user is sole developer + operator
- Currently using DealerCenter for inventory/deals/credit — the goal is full replacement
- TestFlight build is live; iOS app uses Capacitor wrapping the web app
- Production domain cutover is pending (R2 CORS, Twilio webhook, Resend, Vercel)

**Tech environment:**
- Next.js 15 App Router (TypeScript), Prisma 6, Postgres (Supabase), Vercel deploy
- Twilio (voice + SMS, 1 approved number), Microsoft Graph (per-user M365 email), Meta Graph (Instagram DMs, paused)
- Storage: R2 (primary) + Supabase + Cloudinary (multiple backends, candidate for consolidation)
- AI: Anthropic SDK + `@xenova/transformers` for embeddings
- Email send: Resend; image processing: sharp + canvas
- Capacitor 8 for iOS native wrapper

**The unification problem (Phase 0 gate):**
A single physical car currently exists as two unrelated rows: `Vehicle` (recon-board object with stages/parts/photos[]) and `InventoryVehicle` (DealerCenter mirror with cost/price/purchaseType/titleStatus). `Opportunity.vehicleId` references the recon `Vehicle`, not `InventoryVehicle` — so sales attribution is wired to the wrong table. Everything the DMS adds (costs, media, deals, files, credit, documents) must hang off one canonical vehicle. **Phase 0 must resolve this before any later phase begins.**

**Build vs. integrate posture:**
- **Build** (low legal/compliance risk): vehicle unification, cost adds + flooring math, media system + sales send popup, marketing syndication, deal desk workflow + math, files tab, customer promotion, RBAC upgrade, reporting + AI reporting, document prefill (pdf-lib)
- **Integrate** (offloads regulated work): credit pulls via 700Credit reseller (FCRA/GLBA/Red Flags absorbed by reseller); e-signature via BoldSign or Anvil embedded (legally-defensible audit trail + trusted timestamp); QuickBooks Online API for accounting; vPIC (free) + DataOne or Chrome Data (paid) for VIN trim/options

**Known repo concerns (from codebase map) that bleed into DMS scope:**
- No automated tests; TypeScript compiler is the only quality gate — testing strategy needs to be defined as DMS scope expands
- Silent error swallowing in fire-and-forget integration calls — DMS deal/document/credit flows cannot tolerate silent failures
- Webhook signature validation is uneven (Twilio pending, Instagram has bypass paths, Microsoft Graph clientState verification needs cross-check)
- Mega `page.tsx` files (vehicle detail, mechanic schedule, conversations, leads) — DMS UI additions need to avoid making this worse
- No background job queue, no APM, no audit trail beyond `ActivityLog`, no rate limiting

## Constraints

- **Tech stack**: Next.js 15 App Router + Prisma 6 + Postgres (Supabase) + Vercel — fixed; do not introduce a new framework or DB
- **Solo developer**: User is sole engineer + operator — phases must be shippable in isolation; no parallel-team assumptions
- **Live production app**: Existing recon/CRM/messaging users must keep working through every phase — no big-bang rewrites; phase 0 migration is the riskiest and must preserve recon flow
- **Compliance — credit (Phase 6)**: FCRA permissible purpose, GLBA Safeguards Rule, FTC Red Flags Rule. No raw SSN/DOB stored locally — provider holds NPI
- **Compliance — documents (Phase 5)**: ESIGN + UETA (FL adopted UETA), FTC Used Car Rule Buyers Guide, federal odometer disclosure, FL HSMV title/registration forms; legal review before go-live on any signed packet
- **Compliance — PII/NPI generally**: encryption at rest, RBAC on customer/credit records, audit logging of who views credit records (GLBA Safeguards)
- **Florida specifics**: FL sales tax + county surtax rates, doc-fee disclosure, dealer recordkeeping — confirm exact rates with accountant; don't hardcode mine
- **No in-house financing**: closes Reg Z/TILA exposure; do not add without an explicit milestone-level pivot and a compliance review
- **Vendor lock-in awareness**: 700Credit, BoldSign/Anvil, QuickBooks are integration choices that are reversible but costly — model around interfaces, not provider-specific fields

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Promote `InventoryVehicle` into the canonical DMS vehicle (vs. `Vehicle`) | Already owns business/financial fields and DealerCenter-origin data; recon `Vehicle` keeps its stage/parts/checklist flow but references the canonical record | — Pending Phase 0 migration design |
| `Contact.contactType` promotion (lead → customer) instead of a separate Customer table | Already modeled; avoids a new table for a flag change | — Pending Phase 3 implementation |
| `ActivityLog` is the single accountability sink for all DMS writes | Already polymorphic; building a new logger duplicates work | — Pending |
| Cash + outside financing only (no in-house / BHPH for v1) | Avoids Reg Z/TILA scope; legal/compliance surface stays manageable | — Locked for v1 |
| Integrate 700Credit (or eLEND CreditPlus) for credit pulls | Bureau access requires authorized reseller; FCRA/GLBA/Red Flags handled by provider | — Locked; provider choice between 700Credit direct vs. eLEND TBD |
| Integrate BoldSign or Anvil for embedded e-signature | Rent the cryptographic seal + trusted timestamp; build the prefill + UX | — Locked; provider choice between BoldSign vs. Anvil TBD |
| Build document prefill in-house with pdf-lib | Unregulated layer; gives "create it here" feel | — Pending Phase 5 |
| QuickBooks Online via Intuit API (not CSV) | Reduces manual re-entry; sustainable for solo operator | — Pending Phase 7 |
| Phase 0 is a hard gate — no later phase begins until vehicle identity is unified | Every later phase attaches to the canonical vehicle | — Locked |
| Phase order: unify → inventory → media → customer/marketing → deal desk → docs+esign → credit → QBO → reporting+AI | Dependency- and risk-ordered; AI reporting last because data model has to exist first | — Pending (subject to roadmapper refinement) |

---
*Last updated: 2026-06-02 after initialization*
