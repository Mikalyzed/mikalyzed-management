# ARCHITECTURE: Mikalyzed DMS

**Domain:** Dealer Management System layered on existing Next.js 15 + Prisma 6 + Postgres app
**Researched:** 2026-06-02
**Mode:** Project research — architecture dimension
**Overall confidence:** HIGH on patterns / architectural shape; MEDIUM on specific library/provider versions (no web verification possible this session — flag for user validation)

---

## 1. Executive Architecture Summary

The DMS is **not a new app** — it is a domain extension to the existing operations app. Four things must be true for any of it to work:

1. **One canonical vehicle row** that every DMS object hangs off (Phase 0 gate).
2. **One accountability sink** (`ActivityLog`) that every mutation writes to with an actor.
3. **One permission model** richer than a single role string, but compatible with existing `requireRole` callsites (no shotgun rewrite).
4. **One reliability layer** for outbound integrations (e-sign, credit, QBO) — the current "fire-and-forget" pattern is incompatible with regulated workflows.

The architectural shape is a **modular monolith inside the existing Next.js app** — no new service, no new framework, no new DB. New code lives in `lib/dms/<domain>/` (deal, document, credit, qbo, flooring, costing) as service modules with explicit interfaces and provider adapters. API routes stay thin and call services. Services own ActivityLog writes, idempotency, and webhook reconciliation.

---

## 2. Recommended Architecture

### High-level component map

```
┌────────────────────────────────────────────────────────────────────────┐
│  Next.js App Router (Vercel)                                           │
│                                                                        │
│  app/(app)/...                          app/api/...                    │
│  ─────────────                          ─────────────                  │
│  Existing UI (recon, CRM, inbox)        Existing routes                │
│  New UI:                                New routes:                    │
│    /inventory/[id] (canonical)            /api/dms/vehicles            │
│    /deals, /deals/[id]                    /api/dms/deals               │
│    /documents (per vehicle)               /api/dms/documents           │
│    /credit (per deal)                     /api/dms/credit              │
│    /reports                               /api/dms/qbo                 │
│                                           /api/webhooks/esign          │
│                                           /api/webhooks/credit         │
│                                           /api/webhooks/qbo            │
│                                           /api/cron/*                  │
│                                                                        │
│       │           │            │         │                             │
│       ▼           ▼            ▼         ▼                             │
│  ┌─────────────────────────────────────────────────────────┐          │
│  │  lib/dms/<domain>/   (service layer — NEW)              │          │
│  │  ─────────────────                                      │          │
│  │  vehicle/     canonical resolver, recon-bridge          │          │
│  │  costing/     CostAdd math, flooring accrual, true cost │          │
│  │  media/       MediaAsset CRUD, derivative generation    │          │
│  │  deal/        Deal state machine, FL tax/fee math       │          │
│  │  document/    Template registry, pdf-lib prefill        │          │
│  │  esign/       Provider adapter (BoldSign | Anvil)       │          │
│  │  credit/      Provider adapter (700Credit | eLEND)      │          │
│  │  qbo/         Intuit QBO push + reconcile               │          │
│  │  rbac/        Permission resolver, requireCan()         │          │
│  │  jobs/        Job runner, retry, dead-letter            │          │
│  │  audit/       ActivityLog writer + GLBA-grade access log│          │
│  └─────────────────────────────────────────────────────────┘          │
│       │                                                                │
│       ▼                                                                │
│  ┌─────────────────────────────────────────────────────────┐          │
│  │  lib/db (Prisma) — single client                        │          │
│  │  Postgres (Supabase) — single DB                        │          │
│  └─────────────────────────────────────────────────────────┘          │
│                                                                        │
│  External: R2 (docs, signed PDFs, media), Cloudinary (image           │
│  delivery), BoldSign/Anvil (e-sign), 700Credit/eLEND (credit),         │
│  Intuit QBO (accounting), Resend (email), Twilio (existing).           │
└────────────────────────────────────────────────────────────────────────┘
```

### Component boundaries (who owns what, who can write to it)

| Component | Owns (FK source) | Reads from | Writes to (besides own table) |
|-----------|------------------|------------|--------------------------------|
| `lib/dms/vehicle` | `Vehicle` (canonical, post-merge) | DealerCenter mirror feed, vPIC, paid VIN provider | `ActivityLog` |
| `lib/dms/costing` | `CostAdd`, `FlooringAccrual` | `Vehicle`, `Vendor`, `Deal` | `Vehicle.totalCostCache` (denorm), `ActivityLog` |
| `lib/dms/media` | `MediaAsset` | `Vehicle` | `ActivityLog` |
| `lib/dms/deal` | `Deal`, `DealTradeIn`, `DealFee`, `DealStateTransition` | `Vehicle`, `Contact`, `Opportunity`, `CostAdd`, `Document`, `CreditApplication` | `Opportunity.dealId` (single-write back-ref), `Contact.contactType` (lead→customer), `Vehicle.status` (sold), `ActivityLog`, jobs queue |
| `lib/dms/document` | `Document`, `DocumentTemplate` | `Deal`, `Vehicle`, `Contact` | R2 (signed PDF storage), `ActivityLog` |
| `lib/dms/esign` | `SigningSession` | `Document` | `Document.signedPdfR2Key`, `Document.auditCertR2Key`, `ActivityLog`, jobs queue |
| `lib/dms/credit` | `CreditApplication`, `CreditPull`, `CreditAccessLog` | `Contact`, `Deal` | `Deal.creditApplicationId`, `ActivityLog`, `CreditAccessLog` (separate from ActivityLog — GLBA) |
| `lib/dms/qbo` | `QboSyncRecord`, `QboToken` | `Deal`, `CostAdd`, `FlooringAccrual`, `Vendor`, `Contact` | `Deal.qboInvoiceId`, `CostAdd.qboBillId`, `ActivityLog`, jobs queue |
| `lib/dms/rbac` | `Permission`, `RolePermission`, `UserPermission` | `User.role` | — |
| `lib/dms/jobs` | `Job`, `JobAttempt` | all | `ActivityLog` (on failure surface) |
| `lib/dms/audit` | `ActivityLog`, `CreditAccessLog` (new) | all | — |

**FK ownership rule:** New foreign-key columns are owned by the new module. Existing tables (`Vehicle`, `Contact`, `Opportunity`) only receive **outbound** scalar columns from new modules — never inbound FKs into anything but the canonical vehicle. This keeps the recon flow and CRM unaware of DMS internals.

---

## 3. Phase 0: Vehicle unification migration path (HIGH detail — this is the gate)

### The problem statement (restated)

- `Vehicle` row = recon-board object: stages, parts, photos[], status enum (mechanic/.../publish/completed).
- `InventoryVehicle` row = DealerCenter mirror: cost, price, purchase type, title status.
- Same physical car = two unrelated rows with no FK between them. Linked only by humans matching `stockNumber`.
- `Opportunity.vehicleId` references the *recon* `Vehicle` — so sales reporting is wired to the wrong identity.

### Two viable strategies — recommendation: **Strategy A (Promote `Vehicle` as canonical, fold `InventoryVehicle` fields in)**

Reasoning (against the PROJECT.md note that suggests `InventoryVehicle` should become canonical):

- `Vehicle.id` is referenced from **many** existing tables: `VehicleStage`, `Part`, `TransportRequest`, `CalendarItem`, `Opportunity`, `VehicleInterest`. Repointing all of these is high-risk.
- `InventoryVehicle.id` is referenced from **zero** other tables (it's a mirror; nothing FKs into it).
- The fields `InventoryVehicle` owns (cost, price, purchaseType, titleStatus, etc.) are scalar — trivially merged onto `Vehicle`.
- Keep the `id` namespace that everything already points at; absorb the other table's scalars.

**This is a deliberate disagreement with PROJECT.md's "Promote InventoryVehicle into canonical" decision.** The decision was made before counting downstream FKs. Flag for user confirmation. If `InventoryVehicle.id` must win for any reason (e.g., DealerCenter sync uses that id), Strategy B below is workable but ~4x more migration steps.

### Strategy A — phased, safe, reversible

Goal: one canonical `Vehicle` row per physical car. `InventoryVehicle` becomes a write-only ingestion staging table (or is dropped entirely after the cutover).

**Phase 0.A — Schema additions only (zero downtime, no FK flips yet)**

1. `npx prisma migrate dev` — add nullable columns to `Vehicle`:
   - `vehicleCost`, `askingPrice`, `purchaseType`, `purchasedFromVendorId` (FK to `Vendor`, nullable), `titleStatus`, `dateInStock`, `location`, `mileage`, `vehicleInfo`, `inventoryStatus` (separate from recon `status`).
   - `consignmentCommissionPct` (for consignment math, comes later).
   - `inventoryVehicleId` (nullable, FK to `InventoryVehicle`) — temporary bridge column.
2. Add unique index on `Vehicle.vin` (allowing NULL) — needed for dedupe.
3. Run prisma generate. Deploy. Existing code keeps working because columns are nullable.

**Phase 0.B — Backfill (idempotent script, safe to rerun)**

Write `scripts/dms/backfill-canonical-vehicle.ts`. Pseudocode:

```
for each iv in InventoryVehicle:
  match = Vehicle where vin = iv.vin OR stockNumber = iv.stockNumber
  if match:
    copy iv.* scalars onto match (only if match field is null — don't overwrite recon data)
    set match.inventoryVehicleId = iv.id
  else:
    create Vehicle from iv (status defaults to "inventory_only", currentStageId=null)
    set new.inventoryVehicleId = iv.id
log every action to ActivityLog (entityType='vehicle', action='canonical_backfill')
```

Run on a Vercel preview branch DB clone first. Diff before/after. Get a row count and a spot-check report. **Do not proceed to Phase 0.C until backfill is verified manually on a clone.**

**Phase 0.C — Dual-write window (1–2 days, optional but recommended)**

- Modify `app/api/inventory/*` (whatever currently writes `InventoryVehicle`) to also write to canonical `Vehicle`.
- Modify any code that reads `InventoryVehicle` to prefer `Vehicle` and fall back to `InventoryVehicle` if `inventoryVehicleId` is unset.
- Watch the ActivityLog and error logs.
- This window catches any edge case the backfill missed (e.g., DealerCenter imports during the window create new `InventoryVehicle` rows; dual-write ensures they appear in canonical too).

**Phase 0.D — Reader cutover**

- Switch all DMS-facing reads to canonical `Vehicle` only.
- `Opportunity.vehicleId` stays pointing at `Vehicle` (no FK flip needed — this is the whole reason we chose Strategy A).
- Sales attribution is now correct without touching `Opportunity`.

**Phase 0.E — Decommission `InventoryVehicle`**

- Stop writing to `InventoryVehicle` from the DealerCenter sync; point sync at canonical `Vehicle` directly.
- Keep the table for 30 days as audit (read-only).
- Drop in a later migration after the team has confidence.

### Postgres / Prisma migration safety notes

- **All Phase 0.A changes are additive** (new nullable columns, new indexes). Postgres handles these with `ALTER TABLE ... ADD COLUMN` which is metadata-only on recent Postgres versions — no table rewrite, no lock. (HIGH confidence on Postgres 11+ behavior; verify version in Supabase.)
- **Unique index on `vin` allowing NULL**: use `CREATE UNIQUE INDEX CONCURRENTLY` via raw SQL in a Prisma migration to avoid lock; Prisma generates plain `CREATE UNIQUE INDEX` by default — override with custom SQL migration. (MEDIUM confidence — `prisma migrate` does support custom SQL but worth a dry-run.)
- **Backfill scripts run as standalone Node, not as Prisma migrations.** Prisma migrations should never contain bulk data movement — they should add structure only. Bulk moves run as `tsx scripts/...` against the DB with feature flags.
- **FK repointing is NOT needed in Strategy A.** Strategy B (promote `InventoryVehicle.id` as canonical) would require updating `Opportunity.vehicleId`, `VehicleStage.vehicleId`, `Part.vehicleId`, `TransportRequest.vehicleId`, `CalendarItem.vehicleId`, `VehicleInterest.vehicleId` — six tables, multi-step deferred-FK dance, much higher risk. Avoid.

### Risk register for Phase 0

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backfill matches wrong pair (same VIN, different cars) | LOW | HIGH | Dry-run report on clone; manual eyeball before live |
| Recon page crashes because new columns shift component logic | MEDIUM | MEDIUM | Don't modify recon page in Phase 0; add fields only |
| DealerCenter sync writes during window create orphans | MEDIUM | LOW | Dual-write window 0.C absorbs this |
| `InventoryVehicle` referenced somewhere I missed | LOW | MEDIUM | `grep -r "InventoryVehicle\|inventory_vehicles"` before 0.E |
| Hand-rolled SQL migration syntax error locks table | LOW | HIGH | Test every migration on preview DB first |

### Phase 0 is shippable as a milestone of its own. Nothing else starts until 0.E is green.

---

## 4. RBAC upgrade — recommended pattern

### Constraints

- Must coexist with existing `requireRole(userRole, ['admin', 'sales'])` callsites — don't break working code.
- Must support per-module permissions for DMS (e.g., "can view credit results" ≠ "can run credit pulls" ≠ "can sign deals").
- Solo dev — no time to learn a heavy framework like Casbin policy DSL.

### Recommendation: **Role + Permission tables, simple resolver, additive helpers**

Schema additions (NEW):

```prisma
model Permission {
  id        String  @id @default(uuid())
  key       String  @unique  // e.g. "credit.run_hard_pull", "deal.fund", "document.send_to_sign"
  module    String           // "credit" | "deal" | "document" | "vehicle" | ...
  label     String           // human-readable
}

model RolePermission {
  id           String     @id @default(uuid())
  role         String     // matches existing User.role values
  permissionId String     @map("permission_id")
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@unique([role, permissionId])
}

model UserPermission {
  // Per-user overrides (additive only — grants extra; cannot revoke role-implied perms)
  id           String     @id @default(uuid())
  userId       String     @map("user_id")
  permissionId String     @map("permission_id")
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  user         User       @relation(fields: [userId], references: [id])
  @@unique([userId, permissionId])
}
```

Resolver (`lib/dms/rbac/resolve.ts`):

```ts
export async function getUserPermissions(userId: string): Promise<Set<string>> {
  // cache for the request scope
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.role === 'admin') return ALL_PERMISSIONS;  // admin bypass preserved
  const [rolePerms, userPerms] = await Promise.all([
    prisma.rolePermission.findMany({ where: { role: user.role }, include: { permission: true } }),
    prisma.userPermission.findMany({ where: { userId }, include: { permission: true } }),
  ]);
  return new Set([...rolePerms, ...userPerms].map(rp => rp.permission.key));
}

export async function requireCan(userId: string, perm: string): Promise<void> {
  const perms = await getUserPermissions(userId);
  if (!perms.has(perm)) throw new ForbiddenError(perm);
}
```

**Compatibility shim** — keep `requireRole` working:

- existing `requireRole` stays unchanged for legacy callsites
- new code uses `requireCan(userId, 'credit.run_hard_pull')`
- gradually replace `requireRole` as files are touched (no flag day)

### Why not CASL / Casbin / Oso?

- **CASL** (TS-native) is the strongest contender if the user wants attribute-based rules (e.g., "user can edit deals they're assigned to"). It's lightweight and ergonomic. Worth considering if record-level rules become common. (MEDIUM confidence on current CASL state; user should verify version.)
- **Casbin** is overpowered for solo-dev DMS; policy DSL is an extra language to maintain.
- **Bitmap permissions** are fast but obscure; debugging "why doesn't this work" requires translating bits. Not worth it at this scale.
- **Plain tables + key strings** are: easy to seed, easy to read in DB, easy to debug, easy to extend. The right choice here.

### Permission key naming convention

`<module>.<action>` — examples:
- `vehicle.view_cost`, `vehicle.edit_cost`, `vehicle.view_canonical`
- `deal.create`, `deal.edit`, `deal.fund`, `deal.refund`, `deal.view_gross`
- `document.create`, `document.send_to_sign`, `document.void`
- `credit.run_soft`, `credit.run_hard`, `credit.view_results`, `credit.view_adverse_action`
- `qbo.sync`, `qbo.reconcile`
- `report.view_financial`, `report.view_operational`

Seed migration creates all keys + maps to existing roles. Admin gets all. Sales gets `deal.*`, `document.send_to_sign`. Sales_manager adds `deal.fund`, `deal.view_gross`. Mechanic gets `vehicle.view_canonical` only. Etc.

### GLBA carve-out

`credit.view_results` and `credit.view_adverse_action` must additionally write to `CreditAccessLog` (separate from `ActivityLog`) every time they're exercised. This is a regulatory requirement, not a UX one. The `requireCan` helper for credit perms wraps the call to also log the access. See section 7.

---

## 5. Deal model boundary

### How Deal relates to Opportunity

- **Opportunity** = CRM lead/pipeline card. "Customer Sarah is interested in the 2019 Civic, currently in 'Test Drive Scheduled' stage."
- **Deal** = legal/financial record. "Sarah is buying stock #4521 for $18,500 cash with $500 doc fee and $1,200 trade allowance on her 2014 Corolla, sales tax FL 6% + county 1%."
- **Bidirectional** but with **clear ownership of the link:**
  - `Deal.opportunityId` (nullable, FK) — primary direction. A deal *originated* from an opportunity.
  - `Opportunity.dealId` (nullable, FK) — denormalized back-pointer for quick lookup. Set when deal is created, cleared if deal is voided.
  - Strictly **one Deal per Opportunity at a time**. If a deal is voided, the opportunity can spawn a new one.

### When does a won Opportunity spawn a Deal?

**Trigger is explicit user action, not automatic stage transition.**

Sales rep clicks "Create Deal" on the opportunity card → a Deal is drafted with the opportunity's contact + vehicle. The opportunity does NOT auto-move to "won" — it moves to "won" only when the Deal reaches `funded` state. This avoids the trap of "deal fell through but opp is still won."

Concretely:

1. Opportunity in "test drive" stage. Sales clicks **Create Deal**.
2. `Deal` row created in state `draft`. `Opportunity.dealId` set.
3. Sales fills out the deal worksheet (price, fees, trade, financing source).
4. Deal moves to `worksheet_complete` → `documents_sent` → `documents_signed` → `funded`.
5. On `funded`, the opportunity is moved to its pipeline's "won" stage (if not already), `Contact.contactType` flips lead → customer if it was lead, vehicle status moves to `sold`, QBO sync job is queued.

### State machine — where it lives

**Recommendation: hand-rolled state machine in `lib/dms/deal/state.ts`. Do NOT pull in xstate.**

Reasoning:
- ~6–8 states, ~10 transitions. xstate is overkill and adds a learning curve.
- Transitions need DB-level invariants (e.g., can't move to `funded` if `Document.status != 'signed'` for required docs). Easier expressed as plain TS code + Prisma checks than as xstate guards.
- State persists in Postgres (`Deal.state` column + `DealStateTransition` audit table) — xstate's in-memory model is the wrong shape.

Structure:

```ts
// lib/dms/deal/state.ts
export type DealState =
  | 'draft' | 'worksheet_complete' | 'documents_sent'
  | 'documents_signed' | 'credit_approved' | 'funded'
  | 'voided';

const TRANSITIONS: Record<DealState, DealState[]> = {
  draft: ['worksheet_complete', 'voided'],
  worksheet_complete: ['documents_sent', 'voided'],
  documents_sent: ['documents_signed', 'voided'],
  documents_signed: ['credit_approved', 'funded', 'voided'],
  credit_approved: ['funded', 'voided'],
  funded: [],
  voided: [],
};

export async function transitionDeal(dealId: string, to: DealState, actor: User, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId }});
    if (!deal) throw new NotFound();
    if (!TRANSITIONS[deal.state].includes(to)) throw new IllegalTransition(deal.state, to);
    await assertInvariants(tx, deal, to);  // e.g., funded requires signed docs
    await tx.deal.update({ where: { id: dealId }, data: { state: to }});
    await tx.dealStateTransition.create({ data: { dealId, from: deal.state, to, actorId: actor.id, reason }});
    await writeActivityLog(tx, 'deal', dealId, 'state_changed', actor.id, { from: deal.state, to });
    await onEnterState(tx, deal, to);  // side effects (QBO queue, contact promotion, etc.)
    return tx.deal.findUnique({ where: { id: dealId }});
  });
}
```

All transitions go through `transitionDeal`. No raw `prisma.deal.update({ state })` allowed anywhere.

### Deal schema sketch

```prisma
model Deal {
  id              String   @id @default(uuid())
  state           String   @default("draft")
  type            String   // "retail_cash" | "retail_financed" | "wholesale" | "consignment_payout"
  vehicleId       String   @map("vehicle_id")
  contactId       String   @map("contact_id")
  opportunityId   String?  @map("opportunity_id")
  salesPrice      Int      @map("sales_price_cents")
  docFee          Int      @default(0) @map("doc_fee_cents")
  tagTitleFees    Int      @default(0) @map("tag_title_fees_cents")
  salesTax        Int      @default(0) @map("sales_tax_cents")
  countyTax       Int      @default(0) @map("county_tax_cents")
  tradeAllowance  Int      @default(0) @map("trade_allowance_cents")
  tradePayoff     Int      @default(0) @map("trade_payoff_cents")
  consignmentCommissionCents Int? @map("consignment_commission_cents")
  flooringPayoffCents        Int? @map("flooring_payoff_cents")
  totalDueCents              Int  @map("total_due_cents")
  grossProfitCents           Int? @map("gross_profit_cents")  // computed; nullable until funded
  fundedAt        DateTime? @map("funded_at")
  voidedAt        DateTime? @map("voided_at")
  voidedReason    String?   @map("voided_reason")
  qboInvoiceId    String?   @map("qbo_invoice_id")
  createdById     String    @map("created_by_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  vehicle         Vehicle      @relation(fields: [vehicleId], references: [id])
  contact         Contact      @relation(fields: [contactId], references: [id])
  opportunity     Opportunity? @relation(fields: [opportunityId], references: [id])
  tradeIns        DealTradeIn[]
  documents       Document[]
  creditApplications CreditApplication[]
  stateTransitions DealStateTransition[]

  @@index([vehicleId])
  @@index([contactId])
  @@index([state])
  @@map("deals")
}

model DealStateTransition {
  id        String   @id @default(uuid())
  dealId    String   @map("deal_id")
  from      String
  to        String
  actorId   String?  @map("actor_id")
  reason    String?
  createdAt DateTime @default(now()) @map("created_at")
  deal      Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  @@index([dealId, createdAt])
  @@map("deal_state_transitions")
}
```

---

## 6. Document model + e-sign flow

### Data flow (single source of truth: `Document` row tied to `Deal`)

```
User: "Send packet to customer"
   │
   ▼
[1] lib/dms/document/build.ts
    - Looks up DocumentTemplate (purchase agreement, bill of sale, FTC Buyers Guide, etc.)
    - Pulls deal + contact + vehicle data
    - pdf-lib fills template fields
    - Outputs filled PDF buffer per template
   │
   ▼
[2] Create Document rows (one per template in the packet)
    - state = 'draft'
    - filledPdfR2Key = upload to R2 (prefilled, unsigned)
   │
   ▼
[3] lib/dms/esign/provider.ts (adapter: BoldSign | Anvil)
    - createSigningSession({ files: [docs], signers: [contact], redirectUrl, webhookUrl })
    - Returns providerSessionId + embeddable signing URL
    - Document.providerSessionId stored
    - Document.state = 'sent_to_sign'
    - SigningSession row created
   │
   ▼
[4] Customer signs in iframe (embedded in /deals/[id]/sign page)
   │
   ▼ (async, via webhook)
[5] POST /api/webhooks/esign  (provider-agnostic adapter dispatches)
    - Verify signature (HMAC)
    - Idempotency check: SigningSession.providerSessionId + event_id seen before? skip.
    - Mark Document.state = 'signed' or 'declined'
    - Provider returns signed PDF URL + audit certificate URL
    - Enqueue Job: 'esign.fetch_signed_artifacts' (download → R2 → update Document)
   │
   ▼
[6] Job runs (jobs system below)
    - Download signed PDF from provider
    - Download audit certificate
    - Upload both to R2 (signedPdfR2Key, auditCertR2Key)
    - Write ActivityLog (entityType=document, action=signed_artifacts_stored, actor=null/system)
    - If all Documents on a Deal are 'signed' → transition Deal to documents_signed
```

### Document schema

```prisma
model DocumentTemplate {
  id        String   @id @default(uuid())
  key       String   @unique  // "purchase_agreement_cash_fl", "ftc_buyers_guide_as_is", ...
  name      String
  version   Int      @default(1)
  pdfR2Key  String   @map("pdf_r2_key")  // template PDF stored in R2
  fields    Json     // [{ name, page, x, y, type: 'text'|'date'|'sig' }]
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  @@map("document_templates")
}

model Document {
  id                String   @id @default(uuid())
  dealId            String?  @map("deal_id")
  vehicleId         String?  @map("vehicle_id")   // for files-tab docs not tied to a deal (titles, receipts)
  templateId        String?  @map("template_id")
  type              String   // "purchase_agreement" | "bill_of_sale" | "buyers_guide" | "odometer" | "poa" | "title" | "registration" | "receipt" | "other"
  state             String   @default("draft")  // draft | sent_to_sign | signed | declined | voided | external_upload
  filledPdfR2Key    String?  @map("filled_pdf_r2_key")
  signedPdfR2Key    String?  @map("signed_pdf_r2_key")
  auditCertR2Key    String?  @map("audit_cert_r2_key")
  providerSessionId String?  @map("provider_session_id")
  signedAt          DateTime? @map("signed_at")
  createdById       String   @map("created_by_id")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  deal              Deal?    @relation(fields: [dealId], references: [id])
  vehicle           Vehicle? @relation(fields: [vehicleId], references: [id])
  template          DocumentTemplate? @relation(fields: [templateId], references: [id])

  @@index([dealId])
  @@index([vehicleId])
  @@index([state])
  @@map("documents")
}

model SigningSession {
  id                String    @id @default(uuid())
  documentId        String    @map("document_id")
  provider          String    // "boldsign" | "anvil"
  providerSessionId String    @unique @map("provider_session_id")
  embedUrl          String?   @map("embed_url")
  status            String    @default("pending")  // pending | completed | declined | expired
  webhookEvents     Json      @default("[]") @map("webhook_events")  // idempotency log
  createdAt         DateTime  @default(now()) @map("created_at")
  completedAt       DateTime? @map("completed_at")

  document          Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  @@map("signing_sessions")
}
```

### Idempotency, retries, partial failures

- **Webhook idempotency**: every webhook delivery includes a provider event_id. Store the set of processed event_ids on `SigningSession.webhookEvents` (or in a small `WebhookEvent` table). Reject duplicates by returning 200 immediately.
- **Signed-artifact download is a job**, not inline. If provider's CDN is briefly down, the job retries with exponential backoff. ActivityLog records each attempt.
- **Partial packet failures**: if 4 of 5 docs sign but 1 declines → Deal stays in `documents_sent`. UI surfaces declined doc clearly. Operator either voids the deal or re-sends the corrected doc.
- **Provider-agnostic adapter**: `lib/dms/esign/index.ts` exports `createSession(input)`, `getSession(id)`, `fetchSignedFile(sessionId, fileId)`. Two implementations (`boldsign.ts`, `anvil.ts`) selected via env var. Vendor lock-in mitigation per PROJECT.md constraints.

---

## 7. Credit pull architecture (FCRA / GLBA)

### Data model — provider holds NPI; we hold references + decision

```prisma
model CreditApplication {
  id                String   @id @default(uuid())
  dealId            String?  @map("deal_id")  // nullable: prequal can run before a deal exists
  contactId         String   @map("contact_id")
  applicationType   String   // "soft_prequal" | "hard_pull"
  consentCapturedAt DateTime @map("consent_captured_at")
  consentR2Key      String?  @map("consent_r2_key")  // signed consent form
  status            String   @default("submitted")    // submitted | completed | failed
  providerName      String   @map("provider_name")    // "700credit" | "elend"
  providerAppId     String   @map("provider_app_id")
  createdById       String   @map("created_by_id")
  createdAt         DateTime @default(now()) @map("created_at")

  pulls             CreditPull[]
  deal              Deal?    @relation(fields: [dealId], references: [id])
  contact           Contact  @relation(fields: [contactId], references: [id])

  @@index([dealId])
  @@index([contactId])
  @@map("credit_applications")
}

model CreditPull {
  id                String   @id @default(uuid())
  applicationId     String   @map("application_id")
  bureau            String   // "experian" | "equifax" | "transunion" | "tri_merge"
  pulledAt          DateTime @map("pulled_at")
  scoreModel        String?  @map("score_model")  // e.g. "FICO Auto 8"
  score             Int?     // store the number; not the raw bureau report
  decision          String?  // "approved" | "denied" | "conditional" | "review"
  providerPullRef   String   @map("provider_pull_ref")  // reference to provider's stored report
  adverseActionR2Key String? @map("adverse_action_r2_key")  // if denied, store the adverse action notice URL
  reportPdfR2Key    String?  @map("report_pdf_r2_key")  // optional cached PDF of report (encrypted)

  application       CreditApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  accessLogs        CreditAccessLog[]
  @@map("credit_pulls")
}

// SEPARATE from ActivityLog. GLBA requires a tamper-evident access log
// for every view of credit data. Write-only. Never updated, never deleted.
model CreditAccessLog {
  id            String   @id @default(uuid())
  creditPullId  String   @map("credit_pull_id")
  actorId       String   @map("actor_id")
  accessType    String   // "view_score" | "view_decision" | "view_full_report" | "view_adverse_action" | "trigger_pull"
  ipAddress     String?  @map("ip_address")
  userAgent     String?  @map("user_agent")
  createdAt     DateTime @default(now()) @map("created_at")

  creditPull    CreditPull @relation(fields: [creditPullId], references: [id])
  actor         User       @relation(fields: [actorId], references: [id])

  @@index([creditPullId, createdAt])
  @@index([actorId, createdAt])
  @@map("credit_access_log")
}
```

### Why a separate `CreditAccessLog` table (not ActivityLog)

- **Volume**: every "view credit details" page hit is a row. ActivityLog gets noisy fast and slows down general queries.
- **Retention**: GLBA / FCRA recordkeeping requirements differ from operational ActivityLog retention. Separate tables let separate policies apply.
- **Audit isolation**: regulators reviewing a credit audit shouldn't need to filter through unrelated activity. A standalone table is clean.
- **Tamper evidence**: no update/delete code paths anywhere in the codebase write to this table. Append-only by convention; enforced via permission `credit.write_access_log` granted only to the system actor.

### Access path

Every UI element that displays credit data calls `creditService.viewWithAudit(pullId, accessType, user, req)`. That function:

1. Calls `requireCan(user.id, 'credit.view_results')` (or stronger for `view_full_report`).
2. Writes a `CreditAccessLog` row (synchronous, in same transaction as the read).
3. Returns the data.

No code path that reads credit data bypasses this function. Code review is the enforcement; consider an ESLint rule that bans direct `prisma.creditPull.findMany` outside `lib/dms/credit/`.

### Provider adapter

Same pattern as e-sign: `lib/dms/credit/index.ts` defines an interface (`submitApplication`, `pollStatus`, `fetchReport`, `verifyWebhook`); two implementations (`700credit.ts`, `elend.ts`). Webhook handler at `/api/webhooks/credit` dispatches to the configured provider.

### Compliance gates

- Consent capture **must precede** any pull. UI flow: customer signs FCRA consent form (via e-sign) → consent PDF stored in `CreditApplication.consentR2Key` → only then is `submitApplication` callable.
- Adverse action notice handling: if `decision === 'denied'`, store the notice URL, surface it on the deal UI, and require operator to confirm delivery to customer within 30 days (FCRA requirement). Track delivery in `ActivityLog`.

---

## 8. QBO sync architecture

### Decision: **push primary, reconcile secondary**

- **Push** (on `Deal` → `funded`): create a QBO Invoice (or Sales Receipt for cash deals) representing the deal. Create QBO Bills for `CostAdd` rows tied to that vehicle. Push flooring payoff as a journal entry.
- **Reconcile** (daily cron): pull QBO entities updated in the last 24h; flag mismatches (e.g., invoice voided in QBO that's still active in DMS). Surface in admin reports.

Push handles the common case fast; reconcile catches drift (someone edited the invoice in QBO directly, or a push failed silently).

### Sync state model

```prisma
model QboToken {
  id            String   @id @default(uuid())
  realmId       String   @unique @map("realm_id")  // QBO company id
  accessToken   String   @map("access_token")
  refreshToken  String   @map("refresh_token")
  accessExpiresAt DateTime @map("access_expires_at")
  refreshExpiresAt DateTime @map("refresh_expires_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@map("qbo_tokens")
}

model QboSyncRecord {
  id              String   @id @default(uuid())
  entityType      String   // "deal" | "cost_add" | "flooring_payoff"
  entityId        String   @map("entity_id")
  qboEntityType  String   @map("qbo_entity_type")  // "Invoice" | "SalesReceipt" | "Bill" | "JournalEntry"
  qboEntityId    String?  @map("qbo_entity_id")
  status          String   @default("pending")     // pending | synced | failed | voided
  lastSyncedAt    DateTime? @map("last_synced_at")
  lastError       String?  @map("last_error")
  attempts        Int      @default(0)
  payloadHash     String?  @map("payload_hash")    // hash of last pushed payload; skip if unchanged
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  @@unique([entityType, entityId])
  @@index([status])
  @@map("qbo_sync_records")
}
```

### Push flow

1. `Deal.transitionDeal(funded)` → in same transaction, create/update a `QboSyncRecord(entityType='deal', entityId=dealId, status='pending')`.
2. Job runner picks it up: builds QBO payload, posts to Intuit API.
3. Success → `status='synced'`, `qboEntityId` stored. Failure → `status='failed'`, `lastError`, attempts++, schedule retry with backoff (max 5 attempts → dead letter).
4. ActivityLog row written on each attempt outcome.

### Reconcile flow (daily cron at 2am)

1. Vercel cron → `/api/cron/qbo-reconcile` (protected by `CRON_SECRET`).
2. Pull QBO entities `LastUpdatedTime > now() - 24h`.
3. For each, find matching `QboSyncRecord`; flag if local state ≠ QBO state (e.g., local says synced, QBO returned 404 = entity was deleted in QBO).
4. Mismatches written to ActivityLog + a `QboReconciliationFlag` model (small; cleared when operator acknowledges).

### Token refresh

QBO uses OAuth2 with refresh tokens that **also expire** (currently 100 days, but verify — MEDIUM confidence). A daily job refreshes the access token before expiry. If refresh token is within 7 days of expiry, the job emails admin to re-auth. Lost re-auth = sync down — surface this prominently in the admin UI.

---

## 9. Background jobs architecture — the single biggest reliability gap

### Current state

- Zero background job system. Webhook handlers process inline. Failed integration calls disappear silently. Cron is "external scheduler must call endpoint."
- The DMS introduces operations that **cannot tolerate silent failure**: e-sign webhook artifact fetch, credit pull callback, QBO sync, flooring daily accrual, document expiry checks.

### Options analyzed

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Vercel Cron + DB-backed queue** | No new vendor; works on serverless; integrates with existing Postgres; cron triggers via Vercel; observable in DB | Polling latency (minutes, not seconds); requires concurrency control (advisory locks or `SELECT FOR UPDATE SKIP LOCKED`); we own retry logic | **RECOMMENDED for v1** |
| **Inngest** | Purpose-built for serverless; durable; built-in retries, fan-out, scheduled; Next.js-native SDK; free tier | New vendor; lock-in for workflow definitions; cost at scale | Strong contender — see "consider later" |
| **Trigger.dev** | Similar to Inngest; TS-native; good DX | New vendor; less mature than Inngest (MEDIUM confidence on current state) | Skip for now |
| **BullMQ + Upstash Redis** | Battle-tested; rich features (priorities, delayed jobs) | Requires a worker process — Vercel serverless doesn't run long-lived workers; need Vercel background functions or separate worker host | Skip — serverless mismatch |

### Recommendation: **Vercel Cron + DB-backed queue for v1, with a clean Job interface that lets us swap to Inngest later**

Schema:

```prisma
model Job {
  id            String   @id @default(uuid())
  type          String   // "esign.fetch_artifacts" | "qbo.push_deal" | "credit.poll_status" | "flooring.daily_accrual" | ...
  payload       Json
  status        String   @default("pending")  // pending | running | completed | failed | dead_letter
  runAt         DateTime @default(now()) @map("run_at")
  attempts      Int      @default(0)
  maxAttempts   Int      @default(5)
  lastError     String?  @map("last_error")
  lockedAt      DateTime? @map("locked_at")
  lockedBy      String?  @map("locked_by")  // unique cron invocation id
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  attemptsLog   JobAttempt[]
  @@index([status, runAt])
  @@map("jobs")
}

model JobAttempt {
  id        String   @id @default(uuid())
  jobId     String   @map("job_id")
  attempt   Int
  startedAt DateTime @default(now()) @map("started_at")
  finishedAt DateTime? @map("finished_at")
  status    String   // running | completed | failed
  error     String?
  job       Job      @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@map("job_attempts")
}
```

### Runner

Vercel Cron at `/api/cron/run-jobs` every 1 minute (the minimum on Vercel Cron — MEDIUM confidence on current limits, verify). The handler uses `FOR UPDATE SKIP LOCKED` to pick up batches of pending jobs and dispatch by type.

### Why this is enough

- Latency tolerance: e-sign webhook fires → DB write is instant → artifact fetch runs within 60s → fine.
- QBO sync, credit polling, flooring accrual — none need sub-minute latency.
- Vercel Cron + Postgres has zero new vendors. Failure modes are well-understood.
- The `Job` interface is small; if we outgrow it, swapping to Inngest is a Phase 2-of-Phase-7 task.

### What goes through jobs (not inline)

- `esign.fetch_signed_artifacts` (signed PDF + audit cert download)
- `credit.poll_pull_status` (if provider doesn't push webhook reliably — belt-and-suspenders)
- `qbo.push_deal`, `qbo.push_cost_add`, `qbo.refresh_token`, `qbo.daily_reconcile`
- `flooring.daily_accrual` (compute floor plan interest accrual for each financed vehicle, write to `CostAdd`)
- `document.expiry_check` (signing sessions that didn't complete in N days)
- `email.resend_template` (if Resend send fails inline, queue retry)

### What stays inline

- Reads, simple writes, UI mutations that don't cross a network boundary to an unreliable provider.

---

## 10. Storage consolidation — recommendation

### Current state
- R2: primary file storage, presigned uploads for media + customer upload links.
- Supabase storage: appears to be used (env vars present) but unclear how much — INTEGRATIONS.md says "potentially auth, though custom auth via cookies used in code." Likely vestigial or for a narrow case.
- Cloudinary: image/video delivery + transformations for inbound MMS media.

### Recommendation: **R2 for storage of record + Cloudinary for image delivery; drop Supabase storage**

- **R2** is the source of truth for all bytes — recon photos, signed PDFs, audit certs, credit consent docs, cached credit report PDFs, document templates, customer uploads.
- **Cloudinary** stays as the image/video CDN with transformation layer for the *messaging* pipeline (it's already wired and the SMS/MMS flow specifically benefits from on-the-fly `f_auto/q_auto`). New DMS uploads do NOT route through Cloudinary unless they're hot-path UI images.
- **Supabase storage** is dropped from the new code path. If it has existing data, migrate it to R2 in a one-time script during Phase 1 (Inventory core), since that's the phase that touches media most.

### Why
- One canonical store reduces "where is this file" cognitive overhead.
- R2 egress is free → important for serving large signed PDF packets and credit reports.
- GLBA-controlled documents (credit consent, credit reports) should live in **one** bucket with one access policy, not split across providers.
- Cloudinary stays because the existing messaging media pipeline depends on its on-the-fly transformations and removing it is wasted effort with no benefit.

### Migration cost
- Audit Supabase storage usage first (`grep -r supabase.storage` in `lib/` and `app/`). If usage is narrow (one or two upload paths), rewrite to R2 + delete is a single-day task.
- If usage is broader, leave Supabase in place for legacy paths and ban new code from writing to it via lint or code-review convention. Don't do a big-bang migration; deprecate in place.

---

## 11. Suggested build order — dependency graph

The PROJECT.md proposes: unify → inventory → media → customer/marketing → deal desk → docs+esign → credit → QBO → reporting+AI. This is dependency-correct. Refinements based on architecture analysis:

```
Phase 0: Vehicle Unification  ←─── HARD GATE
   │
   ├──> Phase 1a: RBAC upgrade (small, parallel-friendly with 1b)
   │      │
   ├──> Phase 1b: Background jobs scaffold (small, parallel-friendly with 1a)
   │      │      Required by phases 5, 6, 7
   │      │
   ├──> Phase 2: Inventory core (CostAdd, flooring math, VIN intake, vendor purchasing)
   │      │      depends on: canonical Vehicle, RBAC
   │      │
   ├──> Phase 3: Media system (MediaAsset, sales send popup, marketing syndication)
   │      │      depends on: canonical Vehicle
   │      │
   ├──> Phase 4: Customer promotion + Deal desk (Deal model, state machine, FL tax math)
   │      │      depends on: canonical Vehicle, RBAC, CostAdd (for gross calc)
   │      │
   ├──> Phase 5: Document system (templates, pdf-lib prefill, e-sign integration)
   │      │      depends on: Deal model, jobs scaffold
   │      │
   ├──> Phase 6: Credit applications (provider integration, access log)
   │      │      depends on: Deal model, jobs scaffold, e-sign (for consent capture)
   │      │
   ├──> Phase 7: QBO sync
   │      │      depends on: Deal model, CostAdd, jobs scaffold
   │      │
   └──> Phase 8: Reporting + AI extension
                 depends on: most domain data existing in canonical shape
```

### Why RBAC + Jobs in Phase 1 (split from inventory)

- Both are cross-cutting infra. Building them once early is cheaper than retrofitting.
- Both are LOW risk (RBAC is additive table + helpers; jobs is one new table + one cron endpoint).
- Both are HIGH leverage — every subsequent phase calls them.
- Solo-dev tradeoff: shippable in days, not weeks; unblocks confidence for later phases.

### Why customer promotion folds into deal desk (Phase 4)

PROJECT.md lists "customer + marketing" as a separate phase. The customer-promotion logic is a 5-line side effect inside `transitionDeal(funded)` — not a phase. Marketing syndication (price/photos/status feed) is a phase, but it logically belongs with media (Phase 3) since it's a content-delivery concern.

### Why Reporting last

AI reporting (`AskAI` extended for natural-language reports across the DMS) needs the data model to be stable. Building it before phases 4–7 land means rewriting the prompts/schemas. Canned reports could start earlier but offer little value without deals + costs in the data.

---

## 12. Patterns to follow

### P1: Service module, thin route, no logic in components
- `app/api/dms/deals/route.ts` → 10–20 lines: auth, parse, call `dealService.create(...)`, return.
- All math, state transitions, side effects in `lib/dms/deal/*.ts`.

### P2: Provider adapter pattern for everything external
- E-sign, credit, QBO all hide behind interfaces. Switching providers = swap one file.

### P3: Every mutation writes to ActivityLog inside the same transaction
- `prisma.$transaction` wraps mutation + ActivityLog write. If either fails, both roll back.

### P4: State transitions go through `transitionX(id, to, actor)` functions
- No `prisma.deal.update({ state })` outside of `lib/dms/deal/state.ts`.

### P5: Money in cents (integer columns), never floats
- `salesPriceCents`, `docFeeCents`, etc. Existing `Opportunity.value` is already cents — follow that.

### P6: Money math in a `lib/dms/money/` module
- FL tax rate, county surtax, doc fee disclosure — single source of truth functions. Tests if/when testing arrives.

### P7: Webhook handlers verify signature → idempotency-check → enqueue job
- Never do heavy work inline in a webhook handler.

### P8: Permission keys live in `lib/dms/rbac/permissions.ts` as TS constants
- Typo-safe; grepping for `'credit.run_hard'` finds all callsites.

---

## 13. Anti-patterns to avoid

### AP1: Big-bang Phase 0 migration
**Bad outcome:** Recon page breaks; sales attribution wrong for a week; rollback is messy.
**Instead:** Phased migration in section 3 (additive → backfill → dual-write → reader cutover → decommission).

### AP2: Writing to credit data outside `lib/dms/credit`
**Bad outcome:** Bypasses CreditAccessLog. GLBA audit failure.
**Instead:** All credit reads go through `creditService.viewWithAudit`.

### AP3: Putting deal math in API routes
**Bad outcome:** FL rate changes → 12 places to update; bug only in some.
**Instead:** `lib/dms/money/fl-tax.ts` is the only place that knows rates.

### AP4: Fire-and-forget QBO push
**Bad outcome:** Deal funded in DMS, never in QBO. Silent.
**Instead:** Push enqueues a Job in the same transaction. Failed jobs are visible.

### AP5: Permission check at UI only
**Bad outcome:** API endpoint still callable; permission bypass via curl.
**Instead:** Every API route calls `requireCan(...)` for the same key the UI checks.

### AP6: Reusing `Vehicle.photos[]` for the new MediaAsset system
**Bad outcome:** Two media stories diverge; one gets ordered/typed; the other doesn't.
**Instead:** Migrate `Vehicle.photos[]` into `MediaAsset` rows during Phase 3 backfill, then drop the column.

### AP7: Skipping the audit log because "it's just an internal admin action"
**Bad outcome:** Dispute later. "Who changed the price?" — no answer.
**Instead:** Every mutation, including admin overrides, writes ActivityLog. No exceptions.

---

## 14. Confidence assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Phase 0 migration strategy | HIGH | Standard Postgres/Prisma patterns; conservative phased approach |
| RBAC design | HIGH | Plain tables + key strings is a well-trodden path |
| Deal model + state machine | HIGH | Boundaries informed by the existing schema; transitions are domain-driven |
| Document/e-sign flow shape | HIGH (shape) / MEDIUM (provider specifics) | Webhook + idempotency pattern is generic; provider behaviors need verification |
| Credit architecture | HIGH (compliance shape) / MEDIUM (provider specifics) | Separate access log is the right call; provider integration details unverified this session |
| QBO sync (push + reconcile) | MEDIUM | Pattern is standard; QBO API token-refresh specifics need verification |
| Background jobs (DB-backed + Vercel Cron) | HIGH (pattern) / MEDIUM (Vercel limits) | Pattern is robust; Vercel Cron's 1-minute minimum and execution time limits need verification |
| Storage consolidation | HIGH | R2 + Cloudinary split has clear rationale; dropping Supabase storage is low-risk |
| Build order | HIGH | Dependency graph is explicit; matches PROJECT.md with minor refinements |

### Items the user should verify (since web tools were unavailable)

1. Vercel Cron minimum interval (currently believed 1 min on Pro plan; verify your plan).
2. Vercel serverless function timeout (job runner needs ~30s+ for QBO calls).
3. Supabase Postgres version (for `CREATE INDEX CONCURRENTLY` syntax in raw SQL migrations).
4. Prisma 6 migration syntax for raw SQL embedded migrations.
5. BoldSign vs Anvil current pricing/embedded-signing API parity (provider choice in PROJECT.md is deliberately deferred).
6. 700Credit vs eLEND API shape and webhook reliability (provider choice deferred).
7. QBO API current OAuth refresh token TTL (cited 100 days from memory; may have changed).
8. CASL current version + Next.js 15 compatibility if the user wants record-level rules.

---

## 15. Roadmap implications (for the roadmap consumer)

- **Phase 0 is a single milestone with five sub-phases (0.A–0.E)** — don't try to compress.
- **Phase 1 should split into 1a (RBAC) and 1b (jobs)** — both small, both unblocking, parallelizable cognitively.
- **Phases 5 (docs/e-sign) and 6 (credit) both need the jobs scaffold from 1b** — don't reorder them earlier.
- **Phase 7 (QBO) should ship as push-only first**, with reconcile as a second milestone — gets working sync to production faster, lower-risk first ship.
- **Phase 8 (reporting + AI)** is the right tail; nothing depends on it, and everything it depends on must exist first.
- **Storage consolidation is a half-day task that can slot into Phase 1b or Phase 3** — don't make it a phase of its own.

---

## 16. Open architectural questions

1. **Should `Opportunity.dealId` be a true FK or just a denormalized cache?** Recommendation: true FK with nullable + ON DELETE SET NULL. But this couples CRM table to deal lifecycle — confirm intent.
2. **Are wholesale/auction-out dispositions `Deal`s or separate entities?** PROJECT.md says `Deal` supports wholesale. Confirm wholesale and consignment-payout share enough fields with retail to live in one table (recommendation: yes, via `Deal.type` discriminator).
3. **`CostAdd` for time-bound recon labor** — is mechanic time auto-converted into a CostAdd at stage completion, or only manual entry? Recommendation: auto-CostAdd from `VehicleStage.activeSeconds × shop_labor_rate` on stage completion; admin can edit.
4. **Multi-document signing in a single packet vs sequential** — provider-dependent. Recommendation: single combined session per deal where possible (BoldSign supports this; Anvil similar). Reduces customer friction.
5. **Are returns from external repair their own state in Vehicle, or a recon stage?** Existing `return-queue.ts` exists; out of DMS scope but worth confirming the canonical Vehicle keeps this behavior (yes — Phase 0 doesn't touch it).
