# Phase 0: Vehicle Identity Unification - Research

**Researched:** 2026-06-02
**Domain:** Postgres/Prisma 6 schema migration, dual-write/reader-cutover pattern, Next.js 15 App Router UI surgery (vehicle detail tabs + inventory list rewire), Capacitor iOS coordination
**Confidence:** HIGH on codebase facts (grep results), HIGH on Strategy A migration pattern (corroborated by upstream ARCHITECTURE.md), MEDIUM on Prisma 6 raw-SQL migration syntax (no web verification available this session — flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Inventory list (`/inventory` page):**
- Existing inventory tab and list already exist at `/inventory` — Phase 0 does NOT change the visual UI of the list
- Today's columns (Stock # / Vehicle / VIN / Color / Miles / Status / Type) stay as-is
- Phase 0 only **rewires the data source** so the list reads from the canonical `Vehicle` (via the absorbed inventory fields) instead of `InventoryVehicle` directly
- Column changes (Cost, Days-in-Stock, etc.) are deferred to later phases when there's actually new column data to add
- Status tabs (All / In Stock / In Recon / External Repair / Sold / Removed) remain
- The on-demand `/api/vehicles/resolve` bridge endpoint becomes vestigial after cutover (every InventoryVehicle row has a backfilled canonical Vehicle, so click-through is a direct lookup) — leave it as a legacy redirect during the 30-day audit window, then drop

**Vehicle detail page (`/vehicles/[id]`):**
- **Persistent header (always visible regardless of tab):** photo + Year/Make/Model/Trim + Stock # + VIN + current Status pill
- **Top-level tabs:** Recon / Inventory / Activity
- **Default tab when arriving from `/inventory` list:** Inventory tab (since user came from the inventory entry point, show inventory info first)
- **Default tab when arriving from a recon link or mechanic-board:** Recon tab (preserve existing entry behavior)
- **Inventory tab content:** one scrollable view with grouped sections — `Money` (vehicle cost, asking price, purchase type), `Title` (status, location), `Stock info` (stock #, VIN, date in stock, days in stock, mileage), `Source` (purchased from / vendor, acquisition event detail). Everything visible by scrolling
- **Activity tab content:** unified timeline of everything (cost adds, photos uploaded, status changes, messages, deals, etc.) most recent first. Filter chips for narrowing by event type. Reads from existing `ActivityLog` polymorphic table
- **Recon tab content:** preserved as-is — current recon stage UI continues unchanged (stages, parts, checklists, current assignee, timer, approvals)

**Cutover & rollout plan:**
- **Dual-write window:** 1 week. After schema additions are deployed and backfill is verified, writes go to BOTH the old `InventoryVehicle` table AND the canonical `Vehicle` row for 7 days before reader cutover
- **Cutover timing:** flexible — no specific scheduling constraint locked. Decide closer to time when backfill verification + dual-write are both green
- **Users to coordinate with:** small team (1-5 people). Informal heads-up before cutover; no formal external rollout. iOS Capacitor build with new ID resolution logic shipped to TestFlight before cutover
- **Smoke test approach:** BOTH automated and user-driven
  - **Automated post-deploy script** asserts row counts match, sample opportunities resolve to the correct vehicle, sample sales attribution numbers match a pre-migration baseline export
  - **User-driven walkthrough (~15 min):** open `/inventory`, click a car, verify Inventory tab; click another car in recon stage, verify Recon tab; trigger a stage transition; check that activity log on a vehicle includes recent events
- **Rollback plan:** database snapshot taken immediately before reader cutover; feature flag controls whether DMS code paths read from canonical Vehicle or fall back to legacy resolve. Flag-flip rollback is a 1-line config change, not a deploy. Rehearsed on a Supabase preview-branch clone of production data before live cutover

**Backfill matching & orphan handling:**
- **Primary match rule:** stock number. Consistent with existing `/api/vehicles/resolve` behavior; stock # is the join key both tables use today
- **InventoryVehicle rows with no recon Vehicle match (orphan IV):**
  - Create canonical Vehicle in `status = inventory_only` (no recon stages, no `currentStageId`)
  - Visible in `/inventory` list (unchanged)
  - Inventory tab on detail page shows full inventory data; Recon tab shows empty state ("not yet started in recon")
  - Surface in an admin **"unmatched vehicles" review screen** so user can manually re-attach if a stock # got typoed
- **Recon Vehicle rows with no InventoryVehicle match (orphan V):**
  - Keep as-is with null inventory fields (cost, asking price, etc. stay null)
  - Inventory tab on detail page shows empty state ("no inventory data yet — was this car imported from DealerCenter?")
  - Surface in the same admin "unmatched vehicles" review screen
- **Admin "unmatched vehicles" review screen** is part of Phase 0 scope. Shows both directions of orphans; user can search by Year/Make/Model/Trim and manually merge orphan pairs
- **Duplicate VIN (same VIN acquired twice across separate acquisition events):**
  - Create separate canonical Vehicle rows for each acquisition event
  - On the newer Vehicle detail page, show a **"Previous history" banner** above the tabs: "This VIN was previously here as Vehicle X (acquired YYYY-MM-DD, sold YYYY-MM-DD) — view history"
  - Banner links to the old Vehicle's detail page (read-only context)
  - Implementation: `Vehicle.priorVehicleId` (nullable FK to a prior Vehicle row with same VIN) populated during backfill and on any new acquisition where VIN already exists in the system

### Claude's Discretion

- Exact backfill script structure (one-shot vs chunked, batch size)
- Migration ordering details within Phase 0.A (schema additions) — any safe sequence works
- Specifics of the Vercel feature flag mechanism (env var vs DB-config vs build flag)
- Exact UI styling of the new Inventory and Activity tabs (must match existing UI polish standard — custom dropdowns, slide-up sheets, etc.)
- Exact "unmatched vehicles" review screen UI — admin-only, doesn't need polish
- Whether the "Previous history" banner is a single sentence or a small card; match existing patterns

### Deferred Ideas (OUT OF SCOPE)

- **Inventory list column additions** (Cost, Days-in-Stock, others) — Phase 2 (Inventory Core)
- **MediaAsset typed media** — Phase 3 (Media System). Phase 0 just drops vestigial `Vehicle.photos[]` column without migrating it to MediaAsset
- **Activity feed filter UI polish** — basic filter chips in scope; deep filtering / saved-filter views deferred to Phase 8
- **RBAC: who sees vehicle cost/price?** — Phase 1a. Phase 0 shows inventory data to whoever can see the vehicle today
- **Deal data on Activity tab** — Phase 4. Phase 0 Activity tab pulls from existing `ActivityLog` only
- **Mobile vs desktop layout differences for tabs** — match existing UI patterns; deep mobile polish ongoing elsewhere
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VEH-01 | One canonical vehicle record exists for every physical car (Vehicle table absorbs InventoryVehicle fields; Vehicle.id remains canonical PK) | Strategy A schema additions in §3.A — nullable scalar columns absorbed onto `Vehicle`; existing 6-FK ecosystem is left untouched |
| VEH-02 | VehicleMigrationMap captures every old `Vehicle.id` ↔ `InventoryVehicle.id` ↔ canonical mapping with match method and confidence, preserved permanently as audit trail | §3.A schema additions include `VehicleMigrationMap` model; populated during §3.B backfill |
| VEH-03 | Inventory backfill is idempotent and verifiable on a Supabase preview-branch clone before live cutover | §3.B backfill script pattern is idempotent (only writes where canonical field is null; upsert by `oldInventoryVehicleId`); Supabase preview branches documented in §5 |
| VEH-04 | Dual-write window (DealerCenter mirror writes to both `InventoryVehicle` AND canonical `Vehicle`) runs for ≤2 weeks before reader cutover | §3.C dual-write window targets ONE file: `app/api/inventory/route.ts` POST handler (the DealerCenter CSV importer); locked at 7 days per CONTEXT |
| VEH-05 | After reader cutover, every DMS-facing read resolves to the canonical Vehicle; `Opportunity.vehicleId` continues to resolve correctly with no FK flip required | Strategy A invariant — `Opportunity.vehicleId` already points at `Vehicle.id` (confirmed schema line 510); §3.D feature-flag cutover swaps reader paths only |
| VEH-06 | `Vehicle.photos[]` is migrated into `MediaAsset` rows… retained 30 days as fallback then dropped | **CONFLICT WITH CONTEXT.md / PROJECT.md** — Phase 0 scope explicitly says "Drop vestigial `Vehicle.photos[]` column (no MediaAsset migration needed — confirmed unused)". Project Implementation Notes confirm: "no code in `app/` or `lib/` reads or writes" `Vehicle.photos[]`. Photos flow through `UploadLink`, `Message`, R2, Cloudinary. PHASE 0 SCOPE: drop the column outright. MediaAsset model is Phase 3. Flag for planner — REQUIREMENTS.md text is stale relative to CONTEXT.md scope-anchor |
| VEH-07 | Recon workflow continues to function unchanged through Phase 0 | Strategy A invariant — `Vehicle.id` is preserved, so `VehicleStage.vehicleId`, `Part.vehicleId`, `lib/return-queue.ts`, `lib/stage-notifications.ts`, `lib/part-notifications.ts`, mechanic-board, TV board, schedule pages are untouched. §3 risk register + §6 verification covers regression |
| VEH-08 | Rollback plan exists with database snapshot + feature flag for read-from-old-vs-new and is rehearsed on a production data copy before cutover | §3.D feature-flag pattern; §4 rollback rehearsal procedure on Supabase preview branch |
| VEH-09 | Legacy ID redirect endpoint (`/api/vehicles/legacy/:oldId`) returns 301 to canonical for 90 days post-cutover; iOS Capacitor build is pushed pre-cutover | §3.E legacy redirect route at `app/api/vehicles/legacy/[oldId]/route.ts`; uses `VehicleMigrationMap` for lookup; Capacitor checklist in §5 |
</phase_requirements>

## Summary

Phase 0 is a five-sub-phase, additive-then-flip migration that collapses two parallel rows-per-car (`Vehicle` recon + `InventoryVehicle` DealerCenter mirror) into one canonical row keyed by `Vehicle.id`. The migration surface is **small on the FK side** (zero FKs need repointing because `Vehicle.id` is the canonical retained PK — confirmed by grep: only six tables have `vehicleId` FKs and they all already point at `Vehicle.id`) and **small on the writer side** (only two files actively write `InventoryVehicle`: `app/api/inventory/route.ts` POST and `lib/inventory-status.ts`). The reader surface is more spread out (~10 files read `InventoryVehicle` directly) but each is a straightforward swap from `prisma.inventoryVehicle.findMany` to `prisma.vehicle.findMany` filtered by `inventoryStatus IS NOT NULL` (or similar canonical-vehicle filter).

The risk profile is dominated by three things: (1) browser/Capacitor cached `vehicleId` URLs surviving cutover — mitigated by the legacy-redirect endpoint + TestFlight push pre-cutover; (2) the orphan-IV case at backfill (DealerCenter rows with no recon match) — handled by creating `status='inventory_only'` canonical Vehicles + admin review screen; (3) recon-flow regression — mitigated by the Strategy A invariant: every recon-side file (`lib/return-queue.ts`, `lib/stage-notifications.ts`, `lib/part-notifications.ts`, `app/api/stages/*`, `app/api/mechanic-board/*`) only touches `Vehicle.id` and `VehicleStage.vehicleId`, which Phase 0 does not change. Backfill remains the largest unknown — exact match-rate depends on real-world data integrity (stock-number consistency between recon and DealerCenter feeds).

**Primary recommendation:** Sub-phase the work as 0.A schema → 0.B idempotent backfill (verified on Supabase preview branch) → 0.C dual-write (modify `app/api/inventory/route.ts` POST + `lib/inventory-status.ts`) → 0.D feature-flagged reader cutover → 0.E decommission. Build the unmatched-review admin screen and `/api/vehicles/legacy/[oldId]` redirect endpoint BEFORE 0.D. Push iOS Capacitor build with `/api/vehicles/legacy/` resolution to TestFlight 24-48 hours BEFORE 0.D. Don't touch `Vehicle.photos[]` migration; drop the column in 0.E.

## Standard Stack

### Core (already in repo — no new libraries)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 6.x | Schema migrations + ORM | Already canonical in this repo (`prisma/schema.prisma`, `lib/db.ts`) |
| Postgres | (Supabase-hosted) | Source of truth | Production DB; supports `ADD COLUMN` as metadata-only, `CREATE INDEX CONCURRENTLY` for non-blocking unique indexes |
| Next.js | 15 App Router | API routes + UI | Existing — Phase 0 adds routes under `app/api/vehicles/`, `app/api/admin/unmatched-vehicles/` |
| tsx / ts-node | (dev) | Run standalone backfill scripts against the DB | Backfill scripts MUST NOT live inside Prisma migration files (per ARCHITECTURE §3) |
| Capacitor | 8 | iOS wrapper | Existing — pre-cutover TestFlight build is non-negotiable per VEH-09 |

### Supporting (also already in repo)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/db.ts` | n/a | Prisma client singleton | Every new query |
| `prisma.activityLog.create` | n/a | Polymorphic audit sink | Backfill writes one ActivityLog row per canonical merge; every dual-write writes a log; cutover-day writes a log |
| `process.env.*` (Vercel env vars) | n/a | Feature flag mechanism | Recommended for 0.D flag — env-var based gating is already idiomatic in this repo (`lib/twilio.ts`, `lib/graph.ts` read env at module load). Flip = redeploy or use Vercel's env-var edit (no code change). |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Env-var feature flag | DB-config flag (a row in a `FeatureFlag` table) | DB-config allows runtime flip without redeploy, but no such table exists; building one for a one-time cutover is over-engineering. Stick with env var. |
| Idempotent backfill script | One-shot SQL migration | SQL migration is harder to dry-run on Supabase preview and harder to rerun if it partially fails. tsx script with explicit logging is safer for a one-way migration of production data. (ARCHITECTURE §3 explicitly forbids bulk data in Prisma migrations.) |
| New UUID for canonical | Keep `Vehicle.id` (Strategy A) | New UUID would break every `Opportunity.vehicleId`, `VehicleStage.vehicleId`, etc. Strategy A keeps existing IDs — already locked in PROJECT.md Key Decisions. |
| `xstate` for inventory state | Plain enum + transition guards | Inventory has 6 status values (in_stock / in_recon / external_repair / sold / removed / inventory_only). xstate is overkill — match existing pattern in `lib/inventory-status.ts`. |

**No new packages required for Phase 0.** Everything is Prisma migrations + tsx scripts + Next.js routes against the existing stack.

## Architecture Patterns

### Recommended Sub-Phase Structure (delivers VEH-01 through VEH-09)

```
0.A  Schema additions (additive, zero downtime)
       └─> npx prisma migrate dev --name 00a_canonical_vehicle_additions
0.B  Backfill script (idempotent, dry-run-able)
       └─> scripts/dms/00b-backfill-canonical-vehicle.ts
       └─> Verified on Supabase preview branch first
0.C  Dual-write window (7 days per CONTEXT)
       └─> Modify app/api/inventory/route.ts POST (DealerCenter importer)
       └─> Modify lib/inventory-status.ts
       └─> Build admin "unmatched vehicles" review screen
       └─> Build /api/vehicles/legacy/[oldId] redirect endpoint
       └─> Push iOS Capacitor build to TestFlight
0.D  Reader cutover (feature-flag controlled)
       └─> Database snapshot taken FIRST
       └─> Flip env var DMS_READ_CANONICAL_VEHICLE=true
       └─> All ~10 reader files now go through canonical-Vehicle filter
       └─> Smoke tests (automated row-count + sample queries + 15-min user walkthrough)
0.E  Decommission (after 30-day audit window)
       └─> Stop writing to InventoryVehicle in app/api/inventory/route.ts POST
       └─> Drop Vehicle.photos[] column
       └─> Drop InventoryVehicle table (final prisma migration)
       └─> Drop /api/vehicles/legacy/ endpoint after 90 days
```

### Pattern 1: Strategy A schema additions (sub-phase 0.A)

**What:** Add nullable scalar columns to `Vehicle` absorbing every `InventoryVehicle` field. Add `VehicleMigrationMap` table. Add `Vehicle.priorVehicleId` for VIN-history. Add `Vehicle.inventoryStatus` separate from recon `Vehicle.status`. Do NOT drop `Vehicle.photos[]` yet (drop in 0.E).

**When to use:** First migration. Must be zero-downtime — additive only.

**Schema additions (sketch, planner will refine):**

```prisma
// PHASE 0.A — additions to existing Vehicle model
model Vehicle {
  // ... existing fields preserved ...

  // Absorbed from InventoryVehicle (all nullable so existing rows are valid)
  vehicleInfo       String?   @map("vehicle_info")
  trim              String?   // NOTE: Vehicle already has trim — no-op if same
  mileage           Int?
  location          String?
  askingPrice       Float?    @map("asking_price")
  vehicleCost       Float?    @map("vehicle_cost")
  purchaseType      String?   @map("purchase_type")   // PURCHASED / TRADE_IN / CONSIGNMENT / FLOORING
  purchasedFrom     String?   @map("purchased_from")  // raw vendor name string — Vendor FK comes Phase 2
  titleStatus       String?   @map("title_status")    // RECEIVED / NOT RECEIVED
  dateInStock       DateTime? @map("date_in_stock")
  inventoryStatus   String?   @map("inventory_status") // in_stock / in_recon / external_repair / sold / removed / inventory_only
  // Existing Vehicle.status remains the RECON status (mechanic/detailing/content/publish/completed/awaiting_routing/inventory_only)
  // inventoryStatus is the INVENTORY-domain status (separate concern)

  // VIN-history dup banner
  priorVehicleId    String?   @map("prior_vehicle_id")
  priorVehicle      Vehicle?  @relation("VehiclePriorHistory", fields: [priorVehicleId], references: [id])
  laterVehicles     Vehicle[] @relation("VehiclePriorHistory")

  // Migration bridge — preserved permanently as audit per VEH-02 (some teams call this legacy_inventory_vehicle_id)
  legacyInventoryVehicleId String? @map("legacy_inventory_vehicle_id")

  @@index([inventoryStatus])
  @@index([priorVehicleId])
  @@index([vin]) // for VIN dedupe lookup — non-unique because dup VINs are intentionally separate rows
}

// PHASE 0.A — new model
model VehicleMigrationMap {
  id                       String   @id @default(uuid())
  oldVehicleId             String?  @map("old_vehicle_id")             // null if InventoryVehicle had no recon match (orphan IV)
  oldInventoryVehicleId    String?  @map("old_inventory_vehicle_id")   // null if Vehicle had no IV match (orphan V)
  canonicalVehicleId       String   @map("canonical_vehicle_id")
  matchMethod              String   @map("match_method")               // "stock_number" / "manual_review" / "orphan_iv_created" / "orphan_v_left_alone"
  matchConfidence          String   @map("match_confidence")           // "high" / "low" / "manual"
  notes                    String?
  createdAt                DateTime @default(now()) @map("created_at")

  @@index([canonicalVehicleId])
  @@index([oldVehicleId])
  @@index([oldInventoryVehicleId])
  @@map("vehicle_migration_map")
}
```

**Postgres safety notes:** All Phase 0.A additions are nullable column adds (metadata-only on Postgres ≥11) and new table create. No table rewrite, no lock. Prisma 6 `migrate dev` generates safe DDL for these. (HIGH confidence on Postgres behavior; MEDIUM on Prisma 6 raw SQL embedding syntax — flagged in Open Questions.)

### Pattern 2: Idempotent backfill script (sub-phase 0.B)

**What:** Standalone `tsx` script run against the DB. Loops `InventoryVehicle` rows, matches by `stockNumber`, writes canonical Vehicle scalars, populates `VehicleMigrationMap`. Idempotent: rerun-safe via guard checks.

**When to use:** Phase 0.B. Run on Supabase preview branch first, eyeball results, then production.

**Critical idempotency rules:**
1. Only write a canonical Vehicle field if it's currently NULL — never overwrite existing recon-side data (e.g., don't overwrite `Vehicle.vin` if recon already has it).
2. Use `upsert` keyed by `VehicleMigrationMap.oldInventoryVehicleId` so reruns are no-ops.
3. Write an ActivityLog entry per merge: `{ entityType: 'vehicle', action: 'canonical_backfill', details: { oldInventoryVehicleId, matchMethod, matchConfidence } }`.
4. Print a structured report at end: `{ matched: N, orphanIV: N, orphanV: N, dupVin: N, errors: N }`.

**Pseudocode example:**

```typescript
// scripts/dms/00b-backfill-canonical-vehicle.ts
// Run: npx tsx scripts/dms/00b-backfill-canonical-vehicle.ts --dry-run
//      npx tsx scripts/dms/00b-backfill-canonical-vehicle.ts --commit

import { prisma } from '@/lib/db'

const ARGS = new Set(process.argv.slice(2))
const COMMIT = ARGS.has('--commit')

async function main() {
  const stats = { matched: 0, orphanIV: 0, orphanV: 0, dupVinNoted: 0, errors: 0 }
  const ivs = await prisma.inventoryVehicle.findMany({ where: { isActive: true } })

  for (const iv of ivs) {
    // Skip already-mapped
    const existingMap = await prisma.vehicleMigrationMap.findFirst({
      where: { oldInventoryVehicleId: iv.id },
    })
    if (existingMap) continue

    const reconMatch = await prisma.vehicle.findUnique({
      where: { stockNumber: iv.stockNumber },
    })

    if (reconMatch) {
      // MATCHED: absorb iv scalars into reconMatch where canonical field is null
      if (COMMIT) {
        await prisma.$transaction([
          prisma.vehicle.update({
            where: { id: reconMatch.id },
            data: {
              vehicleInfo: reconMatch.vehicleInfo ?? iv.vehicleInfo,
              mileage: reconMatch.mileage ?? iv.mileage,
              location: reconMatch.location ?? iv.location,
              askingPrice: reconMatch.askingPrice ?? iv.askingPrice,
              vehicleCost: reconMatch.vehicleCost ?? iv.vehicleCost,
              purchaseType: reconMatch.purchaseType ?? iv.purchaseType,
              purchasedFrom: reconMatch.purchasedFrom ?? iv.purchasedFrom,
              titleStatus: reconMatch.titleStatus ?? iv.titleStatus,
              dateInStock: reconMatch.dateInStock ?? iv.dateInStock,
              inventoryStatus: reconMatch.inventoryStatus ?? iv.status,
              vin: reconMatch.vin ?? iv.vin,
              legacyInventoryVehicleId: iv.id,
            },
          }),
          prisma.vehicleMigrationMap.create({
            data: {
              oldVehicleId: reconMatch.id,
              oldInventoryVehicleId: iv.id,
              canonicalVehicleId: reconMatch.id,
              matchMethod: 'stock_number',
              matchConfidence: 'high',
            },
          }),
          prisma.activityLog.create({
            data: {
              entityType: 'vehicle',
              entityId: reconMatch.id,
              action: 'canonical_backfill_merged',
              details: { oldInventoryVehicleId: iv.id, matchMethod: 'stock_number' },
            },
          }),
        ])
      }
      stats.matched++
    } else {
      // ORPHAN IV: create canonical Vehicle in inventory_only state
      if (COMMIT) {
        const created = await prisma.vehicle.create({
          data: {
            stockNumber: iv.stockNumber,
            vin: iv.vin,
            year: iv.year,
            make: iv.make || 'Unknown',
            model: iv.model || 'Unknown',
            color: iv.color,
            trim: iv.trim,
            status: 'inventory_only',
            inventoryStatus: iv.status,
            vehicleInfo: iv.vehicleInfo,
            mileage: iv.mileage,
            location: iv.location,
            askingPrice: iv.askingPrice,
            vehicleCost: iv.vehicleCost,
            purchaseType: iv.purchaseType,
            purchasedFrom: iv.purchasedFrom,
            titleStatus: iv.titleStatus,
            dateInStock: iv.dateInStock,
            legacyInventoryVehicleId: iv.id,
          },
        })
        await prisma.vehicleMigrationMap.create({
          data: {
            oldVehicleId: null,
            oldInventoryVehicleId: iv.id,
            canonicalVehicleId: created.id,
            matchMethod: 'orphan_iv_created',
            matchConfidence: 'high',
          },
        })
        await prisma.activityLog.create({
          data: {
            entityType: 'vehicle',
            entityId: created.id,
            action: 'canonical_backfill_orphan_iv',
            details: { oldInventoryVehicleId: iv.id },
          },
        })
      }
      stats.orphanIV++
    }
  }

  // Second pass: detect orphan V (recon Vehicle with no IV match) — log only, no action
  const reconRows = await prisma.vehicle.findMany({
    where: { legacyInventoryVehicleId: null, status: { not: 'inventory_only' } },
    select: { id: true, stockNumber: true },
  })
  for (const v of reconRows) {
    if (COMMIT) {
      await prisma.vehicleMigrationMap.create({
        data: {
          oldVehicleId: v.id,
          oldInventoryVehicleId: null,
          canonicalVehicleId: v.id,
          matchMethod: 'orphan_v_left_alone',
          matchConfidence: 'high',
        },
      })
    }
    stats.orphanV++
  }

  // Third pass: dup-VIN history linking
  const dupVins = await prisma.$queryRaw<{ vin: string; cnt: bigint }[]>`
    SELECT vin, COUNT(*) as cnt FROM vehicles
    WHERE vin IS NOT NULL GROUP BY vin HAVING COUNT(*) > 1
  `
  for (const { vin } of dupVins) {
    const rows = await prisma.vehicle.findMany({
      where: { vin },
      orderBy: { dateInStock: 'asc' },
      select: { id: true, dateInStock: true, priorVehicleId: true },
    })
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].priorVehicleId) continue
      if (COMMIT) {
        await prisma.vehicle.update({
          where: { id: rows[i].id },
          data: { priorVehicleId: rows[i - 1].id },
        })
      }
      stats.dupVinNoted++
    }
  }

  console.log(COMMIT ? 'BACKFILL COMMITTED:' : 'BACKFILL DRY-RUN:', stats)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

### Pattern 3: Dual-write surface (sub-phase 0.C)

**What:** Modify the TWO files that currently write `InventoryVehicle` so they also write to canonical `Vehicle`.

**The two writer files (grep-verified):**

1. **`app/api/inventory/route.ts` POST `action=='import'`** — the DealerCenter CSV importer. Currently `prisma.inventoryVehicle.upsert` on lines 133–170 and `prisma.inventoryVehicle.updateMany` for stale rows on line 181. Modify to: after each `upsert`, also `upsert` a canonical `Vehicle` row keyed by `stockNumber` with the absorbed scalars. For stale rows, also update the canonical `Vehicle.inventoryStatus = 'sold'`.

2. **`lib/inventory-status.ts`** — `recomputeInventoryStatus(stockNumber)` updates `InventoryVehicle.status` based on recon state. Modify to also update `Vehicle.inventoryStatus` in the same transaction. Called from any recon-side mutation that changes vehicle stage (must grep to find call sites — likely `app/api/stages/[id]/route.ts`, `app/api/mechanic-board/route.ts`, `app/api/vehicles/[id]/route.ts`).

**Pattern: wrap in `prisma.$transaction([...])` so failure of either write rolls back both.**

### Pattern 4: Reader-cutover feature flag (sub-phase 0.D)

**What:** Single env var `DMS_READ_CANONICAL_VEHICLE` (default `'false'`). All reader code paths that touch `InventoryVehicle` check this flag and either go to canonical or stay on legacy.

**Where to gate:** Build a `lib/dms/vehicle/canonical-reader.ts` helper:

```typescript
// lib/dms/vehicle/canonical-reader.ts
import { prisma } from '@/lib/db'

const READ_CANONICAL = process.env.DMS_READ_CANONICAL_VEHICLE === 'true'

export async function getInventoryList(opts: { where: any; orderBy: any; take: number; skip: number }) {
  if (READ_CANONICAL) {
    return prisma.vehicle.findMany({
      where: { ...opts.where, inventoryStatus: { not: null } }, // only rows that came from DealerCenter (i.e., have inventory data)
      orderBy: opts.orderBy,
      take: opts.take,
      skip: opts.skip,
    })
  }
  return prisma.inventoryVehicle.findMany(opts)
}
```

**Files needing this gating (grep-verified ~10 callsites):**
- `app/api/inventory/route.ts` GET (line 36, 42, 43)
- `app/api/inventory/ask/route.ts` (line 361)
- `app/api/vehicles/route.ts` (line 50)
- `app/api/vehicles/resolve/route.ts` (line 29)
- `lib/inventory-status.ts` (lines 12, 41 — read for status compute)

**Flip procedure:**
1. Take database snapshot.
2. Set `DMS_READ_CANONICAL_VEHICLE=true` in Vercel env vars.
3. Redeploy (or use Vercel's instant env-var-only redeploy).
4. Run automated smoke test script.
5. User-driven 15-min walkthrough.
6. If green → leave flipped. If red → flip back (1-line change), redeploy, restore from snapshot if data drift occurred.

### Pattern 5: `/api/vehicles/legacy/[oldId]` redirect (built in 0.C, deployed before 0.D)

**What:** Catches stale URLs from browser caches / Capacitor WebView / external links.

```typescript
// app/api/vehicles/legacy/[oldId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ oldId: string }> }) {
  const { oldId } = await params
  const map = await prisma.vehicleMigrationMap.findFirst({
    where: { OR: [{ oldVehicleId: oldId }, { oldInventoryVehicleId: oldId }] },
    select: { canonicalVehicleId: true },
  })
  if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // 301 to canonical
  return NextResponse.redirect(new URL(`/vehicles/${map.canonicalVehicleId}`, _req.url), 301)
}
```

(Note: with Strategy A, in practice almost every `oldId` IS the canonical id already since `Vehicle.id` is preserved. The redirect is critical only for `oldInventoryVehicleId` lookups, since those IDs ceased to be navigable when `InventoryVehicle` was decommissioned. Browser/Capacitor cached recon-page URLs all resolve directly.)

### Pattern 6: Vehicle detail page tabs (per CONTEXT)

**Current state** (grep-verified at `app/(app)/vehicles/[id]/page.tsx`):
- 1799-line client component
- Already has 3 tabs via `activeTab` state: `overview`, `parts`, `history`
- Tab switching pattern visible at lines 96, 512–534, 550, 803, 812
- URL `?tab=` reads initial tab (line 92–95)

**Phase 0 transformation:**
- Rename `overview` → `recon` (or keep `overview` content under Recon tab — preserves URLs)
- Add `inventory` tab (new — content described in CONTEXT)
- Rename `history` → `activity` and make it read from `ActivityLog` polymorphic (currently it reads from `/api/vehicles/[id]/history` which already queries `prisma.activityLog.findMany` at line 63 — small reshape)
- Move `parts` tab content under Recon tab (per CONTEXT "Recon tab content preserved as-is")
- Add **persistent header** (photo + YMM + Stock# + VIN + Status pill) ABOVE the tab switcher
- Default tab logic: read URL `?tab=` first; fallback to `?from=inventory` → `inventory`; fallback to `recon`
- Add **"Previous history" banner** above tabs when `vehicle.priorVehicleId` is set

**Surface area:**
- One large component refactor of `app/(app)/vehicles/[id]/page.tsx`
- New API endpoint or extend existing `/api/vehicles/[id]` GET to include canonical inventory fields (cost, asking price, etc.)
- ActivityLog filter chips — pure client-side filter on already-fetched timeline; or extend `/api/vehicles/[id]/history` GET to accept `?actions=` param

**The Inventory tab is read-only in Phase 0** — Phase 0 is migration. Edit UI for cost/price/etc. is Phase 2 scope.

### Pattern 7: Admin "unmatched vehicles" review screen (per CONTEXT — Phase 0 scope)

**Route:** `app/(app)/admin/unmatched-vehicles/page.tsx` + `app/api/admin/unmatched-vehicles/route.ts`

**Source data:**
- Orphan IV rows: `Vehicle.where({ status: 'inventory_only', priorVehicleId: null })`
- Orphan V rows: `Vehicle.where({ legacyInventoryVehicleId: null, status: { not: 'inventory_only' } })`

**Actions:**
- Search by YMM
- Manual merge: pick one orphan IV + one orphan V → calls POST endpoint that copies IV scalars onto V, sets `Vehicle.legacyInventoryVehicleId`, writes `VehicleMigrationMap` row with `matchMethod='manual_review'`, deletes the orphan IV Vehicle (or marks it `status='merged_into'` with FK to the surviving canonical)

**Admin-only** (per CONTEXT: doesn't need polish). Use existing `requireRole(user, ['admin'])` from `lib/auth.ts`.

### Anti-Patterns to Avoid

- **Don't put backfill logic inside a Prisma migration file.** Use a separate tsx script. (ARCHITECTURE §3, repeated.)
- **Don't drop `Vehicle.photos[]` in 0.A.** It's vestigial but dropping a column triggers a Postgres column-rename concern and Prisma client-cache churn. Drop in 0.E after 30-day audit window.
- **Don't repoint FKs.** Strategy A's whole point is `Vehicle.id` stays canonical. If a plan says "update `Opportunity.vehicleId` references" — wrong plan.
- **Don't dedupe by VIN alone during backfill.** Per CONTEXT: dup VINs are intentionally separate rows linked via `priorVehicleId`. Match by stockNumber only.
- **Don't auto-archive orphans.** Per CONTEXT: build the review screen, let user re-attach.
- **Don't touch `lib/return-queue.ts`, `lib/stage-notifications.ts`, `lib/part-notifications.ts` in Phase 0.** They only reference `Vehicle.id` (grep-verified) — Strategy A invariant means they keep working.
- **Don't combine 0.C dual-write deploy with 0.D reader cutover in the same release.** 7-day buffer per CONTEXT.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency on backfill rerun | Custom "have I run this before" check | Guard via `prisma.vehicleMigrationMap.findFirst({ where: { oldInventoryVehicleId } })` — bail if exists | Single source of truth: the mapping table IS the "have I done this" record |
| Feature flag for reader cutover | New `FeatureFlag` model + admin UI | Vercel env var `DMS_READ_CANONICAL_VEHICLE` + redeploy | One-time cutover; building infrastructure for a one-shot flip is over-engineering. (ARCHITECTURE §1b suggests env var is the idiomatic Vercel pattern.) |
| 301 redirect with logging | Build custom redirect handler with audit row per redirect | `NextResponse.redirect(url, 301)` + Vercel access logs | Vercel already logs every request; redirect count is a `grep '/api/vehicles/legacy/'` away |
| ActivityLog write helper | New `auditService.write(...)` lib | Direct `prisma.activityLog.create({ data: { entityType, entityId, action, actorId, details } })` — the repo already does this in 18+ files | Match existing pattern; introducing a wrapper inverts cost/benefit at this scale. Phase 1+ may consolidate. |
| Database snapshot tooling | Custom dump script | Supabase's built-in branch + restore (or `pg_dump` to local file pre-cutover) | Supabase preview branches are documented (and per ARCHITECTURE §1b they're already in Phase 1b plans) — use the platform |
| State machine for `inventoryStatus` transitions | xstate / hand-rolled state machine | Plain enum + transition guards in `lib/inventory-status.ts` | Six states, two writers; over-engineering. Phase 4 Deal model gets a real state machine. |

**Key insight:** Phase 0 is a migration, not a new system. Every "should we build infra for X" answer is: NO — use the cheapest valid approach. Real infra (RBAC tables, job queue, etc.) lands in Phase 1a/1b.

## Common Pitfalls

(Drawn from PITFALLS.md §1 + Phase 0 codebase analysis.)

### Pitfall 1: Opportunity attribution silently re-targets the wrong vehicle (from PITFALLS §1)
**What goes wrong:** With Strategy A, this risk is largely neutralized — `Opportunity.vehicleId` already points at `Vehicle.id` and Phase 0 doesn't change `Vehicle.id`. But if backfill creates an orphan-IV canonical Vehicle with a stockNumber that ALSO matches a recon Vehicle (e.g., the recon was completed and archived so the match query found nothing), a sales rep might link a NEW opportunity to the newly-created orphan-IV row instead of the historical archived recon row.
**Why it happens:** Backfill's stockNumber match is exact; archived/completed recon Vehicles may have moved stockNumber or be flagged differently.
**How to avoid:**
- Backfill match query: `prisma.vehicle.findUnique({ where: { stockNumber } })` — confirm this returns ANY Vehicle including completed/archived ones (the `findUnique` query in the existing resolve endpoint at `app/api/vehicles/resolve/route.ts:21` does — no completedAt filter).
- For each backfill orphan IV: confirm there's no archived recon Vehicle with that VIN+stockNumber combo. Log warnings.
- Post-backfill audit query: any Vehicle with `inventoryStatus IS NOT NULL` AND `status='inventory_only'` whose VIN also appears on another Vehicle → manual review.
**Warning signs:** Post-cutover sales reports differ from DealerCenter baselines by more than rounding error.

### Pitfall 2: Recon flow breaks because something I missed reads InventoryVehicle (from PITFALLS §1 CRITICAL)
**What goes wrong:** A reader file is missed during 0.D reader cutover, leaves a stale `prisma.inventoryVehicle.findFirst` call, returns null for orphan-IV vehicles (which no longer have an InventoryVehicle row after 0.E).
**Why it happens:** ~10 reader files spread across `app/` and `lib/` — easy to miss one.
**How to avoid:**
- Before 0.D: `grep -rn "inventoryVehicle\|prisma\.inventoryVehicle" app/ lib/` and check every result is either gated by `DMS_READ_CANONICAL_VEHICLE` or explicitly OK to leave on legacy (e.g., `lib/inventory-status.ts` writer side stays dual-write until 0.E).
- Pre-0.E sweep: rerun grep, every hit must be a write inside the dual-write surface or a deleted file. If anything else remains → don't decommission yet.
**Warning signs:** 404s on `/inventory` after 0.D for vehicles known to exist; "no inventory data" empty state on Inventory tab for cars that have cost/price set.

### Pitfall 3: Stale Capacitor iOS WebView state (from PITFALLS §1 CRITICAL)
**What goes wrong:** iPhone users on yesterday's Capacitor build hit `/vehicles/[old-InventoryVehicle.id]` after 0.E decommission → InventoryVehicle table is gone → 404.
**Why it happens:** Capacitor WebView caches more aggressively than browsers; users don't update apps daily.
**How to avoid:**
- Strategy A mitigates this for most URLs (recon-side `/vehicles/[Vehicle.id]` URLs keep working — `Vehicle.id` is preserved).
- For InventoryVehicle-side cached URLs (anyone deep-linked into `/api/inventory/[InventoryVehicle.id]`?): `/api/vehicles/legacy/[oldId]` 301 redirect catches these for 90 days.
- Push iOS Capacitor build with the new code path to TestFlight 24-48 hours BEFORE 0.D cutover. New build doesn't need to be installed by all users — just need to confirm the build still works against pre-cutover backend (feature-flag-gated so it's safe).
**Warning signs:** TestFlight crash reports referencing `/api/inventory/...` or 404 spikes on legacy InventoryVehicle IDs post-0.E.

### Pitfall 4: Backfill non-idempotent on rerun (from PITFALLS §1 + ARCHITECTURE §3)
**What goes wrong:** Initial backfill run fails halfway through. Rerun overwrites already-correct canonical Vehicles with stale IV data (because the iteration doesn't know what was already done).
**How to avoid:** Guard EVERY backfill action with a `vehicleMigrationMap.findFirst({ where: { oldInventoryVehicleId } })` check. If a map row exists, skip. Tested by running the script twice on the same DB and confirming stats show second-run all-zero.
**Warning signs:** Backfill output shows non-zero `matched` count on second run.

### Pitfall 5: Dual-write window catches a write to one side but not both (from PITFALLS §1)
**What goes wrong:** `app/api/inventory/route.ts` POST imports a CSV → `InventoryVehicle.upsert` succeeds → canonical `Vehicle.upsert` fails (e.g., unique constraint on stockNumber due to a typo) → only old side written. Next CSV import day, same row is "updated" with new data on old side, canonical side still has wrong row.
**How to avoid:** Wrap the dual-write in `prisma.$transaction([...])` — if either fails, both roll back. Return a clear error so the CSV import shows partial-failure status.
**Warning signs:** Daily reconciliation check (row counts match between IV and canonical) fails for a specific stockNumber.

### Pitfall 6: VEH-06 conflict (REQUIREMENTS.md says migrate `Vehicle.photos[]` to MediaAsset; CONTEXT scope says drop)
**What goes wrong:** Planner takes the requirement at face value and plans a Phase 0 MediaAsset model + photo migration, blowing up scope.
**How to avoid:** Use CONTEXT.md / PROJECT.md Implementation Notes as the source of truth. PROJECT.md line 119 is explicit: "no code in `app/` or `lib/` reads or writes" `Vehicle.photos[]`. Drop the column in 0.E. MediaAsset is Phase 3 scope. The planner should mark this requirement as "drop column in 0.E, defer MediaAsset to Phase 3" — NOT plan a MediaAsset model.
**Warning signs:** Phase 0 plan grows a MediaAsset model.

### Pitfall 7: Concurrent CSV import during backfill (ARCHITECTURE §3.B)
**What goes wrong:** Backfill is running. Meanwhile, scheduled DealerCenter CSV import fires (or user manually triggers it). New `InventoryVehicle` rows created mid-backfill don't get canonical Vehicles.
**How to avoid:** Run backfill during a low-activity window (after-hours). Confirm no scheduled imports are queued. Verify post-backfill that every `InventoryVehicle` has a `VehicleMigrationMap` entry — if any are missing, rerun backfill (idempotent, safe).
**Warning signs:** Post-backfill `prisma.inventoryVehicle.count` differs from `prisma.vehicleMigrationMap.where({ oldInventoryVehicleId: { not: null } }).count`.

## Code Examples

### Schema bridge column add (sub-phase 0.A — Prisma migration)

```prisma
// prisma/schema.prisma — add to Vehicle model
model Vehicle {
  // ... existing fields ...

  // Phase 0.A — absorbed from InventoryVehicle (nullable for compat)
  vehicleInfo              String?   @map("vehicle_info")
  mileage                  Int?
  location                 String?
  askingPrice              Float?    @map("asking_price")
  vehicleCost              Float?    @map("vehicle_cost")
  purchaseType             String?   @map("purchase_type")
  purchasedFrom            String?   @map("purchased_from")
  titleStatus              String?   @map("title_status")
  dateInStock              DateTime? @map("date_in_stock")
  inventoryStatus          String?   @map("inventory_status")
  priorVehicleId           String?   @map("prior_vehicle_id")
  priorVehicle             Vehicle?  @relation("VehiclePriorHistory", fields: [priorVehicleId], references: [id])
  laterVehicles            Vehicle[] @relation("VehiclePriorHistory")
  legacyInventoryVehicleId String?   @map("legacy_inventory_vehicle_id")

  @@index([inventoryStatus])
  @@index([priorVehicleId])
  // Keep existing indexes
}
```

```bash
# Generate migration
npx prisma migrate dev --name 00a_canonical_vehicle_additions
```

### Dual-write modification — `app/api/inventory/route.ts` POST (sub-phase 0.C)

```typescript
// BEFORE (existing — lines 133-170 of app/api/inventory/route.ts)
await prisma.inventoryVehicle.upsert({
  where: { stockNumber: stock },
  update: { /* iv scalars */ },
  create: { /* iv scalars */ },
})

// AFTER (Phase 0.C dual-write)
await prisma.$transaction([
  prisma.inventoryVehicle.upsert({
    where: { stockNumber: stock },
    update: { /* iv scalars — unchanged */ },
    create: { /* iv scalars — unchanged */ },
  }),
  prisma.vehicle.upsert({
    where: { stockNumber: stock },
    update: {
      // Only update fields that the CSV row provides — don't overwrite recon-side data
      vehicleInfo: info,
      mileage: row.mileage ? parseInt(row.mileage) || null : null,
      location: row.location?.trim() || null,
      askingPrice: row.askingPrice ? parseFloat(row.askingPrice) || null : null,
      vehicleCost: row.vehicleCost ? parseFloat(row.vehicleCost) || null : null,
      purchaseType: row.purchaseType?.trim() || null,
      purchasedFrom: row.purchasedFrom?.trim() || null,
      titleStatus: row.titleStatus?.trim() || null,
      dateInStock: row.dateInStock ? new Date(row.dateInStock) : null,
      inventoryStatus: nextStatus,
    },
    create: {
      stockNumber: stock,
      vin: row.vin?.trim() || null,
      year,
      make: make || 'Unknown',
      model: model || 'Unknown',
      color: row.color?.trim() || null,
      status: 'inventory_only',
      inventoryStatus: nextStatus,
      vehicleInfo: info,
      mileage: row.mileage ? parseInt(row.mileage) || null : null,
      location: row.location?.trim() || null,
      askingPrice: row.askingPrice ? parseFloat(row.askingPrice) || null : null,
      vehicleCost: row.vehicleCost ? parseFloat(row.vehicleCost) || null : null,
      purchaseType: row.purchaseType?.trim() || null,
      purchasedFrom: row.purchasedFrom?.trim() || null,
      titleStatus: row.titleStatus?.trim() || null,
      dateInStock: row.dateInStock ? new Date(row.dateInStock) : null,
    },
  }),
])
```

### Reader gating helper (sub-phase 0.D)

```typescript
// lib/dms/vehicle/canonical-reader.ts (new file)
import { prisma } from '@/lib/db'

const READ_CANONICAL = process.env.DMS_READ_CANONICAL_VEHICLE === 'true'

export function isCanonicalReadMode(): boolean { return READ_CANONICAL }

// Drop-in replacement for prisma.inventoryVehicle.findMany used by GET /api/inventory
export async function getInventoryList(args: {
  where: any
  orderBy: any
  take: number
  skip: number
}) {
  if (READ_CANONICAL) {
    return prisma.vehicle.findMany({
      where: {
        ...args.where,
        // Canonical Vehicles that came from DealerCenter have inventoryStatus set
        inventoryStatus: { not: null },
      },
      orderBy: args.orderBy,
      take: args.take,
      skip: args.skip,
    })
  }
  return prisma.inventoryVehicle.findMany(args)
}
```

### Legacy redirect endpoint (built in 0.C, deployed before 0.D)

```typescript
// app/api/vehicles/legacy/[oldId]/route.ts (new file)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ oldId: string }> }) {
  const { oldId } = await params
  const map = await prisma.vehicleMigrationMap.findFirst({
    where: { OR: [{ oldVehicleId: oldId }, { oldInventoryVehicleId: oldId }] },
    select: { canonicalVehicleId: true },
  })
  if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(new URL(`/vehicles/${map.canonicalVehicleId}`, req.url), 301)
}
```

## Codebase Audit Results (grep-verified, source of truth for planner)

### FK columns referencing `Vehicle.id` (Strategy A keeps these intact — ZERO need repointing)

From `prisma/schema.prisma`:

| Model | Line | Column | Cascade | Note |
|-------|------|--------|---------|------|
| `Part` | 95 | `vehicleId` (required) | onDelete: Cascade | Recon parts; cascade deletes if Vehicle deleted |
| `VehicleStage` | 135 | `vehicleId` (required) | onDelete: Cascade | Recon stages; cascade |
| `TransportRequest` | 177 | `vehicleId` (nullable) | (no cascade) | Transport reqs may exist without vehicle |
| `Opportunity` | 510 | `vehicleId` (nullable) | (no cascade) | Sales attribution; critical for VEH-05 |
| `VehicleInterest` | 596 | `vehicleId` (nullable) | (no cascade) | Customer "interested in this car" |
| `CalendarItem` | 815 | `vehicleId` (nullable) | (no cascade) | Scheduled events |

(`WeeklyPlanSnapshot.entries` JSON contains `vehicleId` keys but is denormalized at snapshot time — not a real FK; auto-heals when next snapshot is taken.)

**All six tables FK to `Vehicle.id`. Zero FK to `InventoryVehicle.id`.** Strategy A invariant: nothing flips.

### `prisma.vehicle.*` call sites (codebase audit — ~40 hits)

These ALL stay working through Phase 0 because `Vehicle.id` is preserved. Quick scan grouped by file:

**Reader-only files (no concern for Phase 0):**
- `app/api/dashboard/route.ts` — count queries by status; no changes needed
- `app/api/eod-report/route.ts` — count queries; no changes
- `app/api/reports/route.ts` — counts + active list; no changes
- `app/api/tv-board/route.ts` — count; no changes
- `app/api/vehicles/[id]/route.ts` — single GET/PATCH/DELETE — extend GET response to include new canonical inventory fields (Inventory tab needs them)
- `app/api/vehicles/route.ts` — list — extend response if needed
- `app/api/vehicles/[id]/history/route.ts` — already reads ActivityLog (line 63, 75); reshape for filter-chips
- `app/api/vehicles/[id]/move-stage/route.ts`, `app/api/vehicles/[id]/restart/route.ts`, `app/api/vehicles/[id]/route-stage/route.ts` — recon flow, no changes (Strategy A invariant)
- `app/api/stages/[id]/route.ts`, `app/api/stages/[id]/timer/route.ts` — recon flow, no changes
- `app/api/mechanic-board/route.ts` — recon flow, no changes
- `app/api/parts/[id]/route.ts`, `app/api/parts/route.ts` — parts, no changes
- `app/api/transport/route.ts` — transport, no changes

**Writer files affected:**
- `app/api/inventory/route.ts` line 80 — `prisma.vehicle.findMany` is used to find active recon stocks for cross-ref during CSV import. After 0.E this query becomes the canonical "any Vehicle row with this stockNumber" — no behavior change needed but the comment can be updated. (Not a writer concern in 0.C.)
- `app/api/vehicles/resolve/route.ts` — see §"resolve endpoint" below

**No `select:` queries observed that would silently drop new canonical inventory fields** — grep audit confirms most reads use full row or recon-specific selects. Vehicle detail GET will need explicit field expansion when Inventory tab is added.

### `InventoryVehicle` reference sites (the cutover surface — grep-verified)

**Writer-side (changes in 0.C dual-write, removed in 0.E):**
- `app/api/inventory/route.ts` POST — DealerCenter CSV importer
  - Line 120: `prisma.inventoryVehicle.findUnique` (read for status preservation logic — keep in dual-write window)
  - Line 133: `prisma.inventoryVehicle.upsert` (the main write — add canonical Vehicle upsert in same `$transaction`)
  - Line 181: `prisma.inventoryVehicle.updateMany` (mark stale as sold — mirror to canonical Vehicle.inventoryStatus)
- `lib/inventory-status.ts` — `recomputeInventoryStatus()`
  - Line 12: read IV current status
  - Line 41: update IV status — add canonical Vehicle.inventoryStatus write in same `$transaction`

**Reader-side (gate behind feature flag in 0.D):**
- `app/api/inventory/route.ts` GET
  - Line 36: `prisma.inventoryVehicle.findMany` (main list query)
  - Line 42: `prisma.inventoryVehicle.count` (total count)
  - Line 43: `prisma.inventoryVehicle.groupBy({ by: ['status'] })` (status tab counts)
- `app/api/inventory/ask/route.ts` line 361 — AI inventory ask reads `InventoryVehicle.findMany` for embedding context
- `app/api/vehicles/route.ts` line 50 — `prisma.inventoryVehicle.findMany` (some search path)
- `app/api/vehicles/resolve/route.ts` line 29 — `prisma.inventoryVehicle.findUnique` (the bridge endpoint — see below)

**UI references (no direct DB but consume `InventoryVehicle` shape via API):**
- `app/(app)/inventory/page.tsx` line 6: TypeScript shape comment for inventory response (no DB call)
- `app/(app)/transport/new/page.tsx` line 32, 216 — naming only (`addInventoryVehicle` is a UI helper name; not a DB call)
- `app/(app)/external/page.tsx` line 170 — comment warning; no DB call

### Existing `/api/vehicles/resolve` endpoint analysis

**Current behavior** (`app/api/vehicles/resolve/route.ts`):
- POST takes `{ stockNumber }`
- 1) Tries `prisma.vehicle.findUnique({ where: { stockNumber } })` — returns its id if found
- 2) Else tries `prisma.inventoryVehicle.findUnique({ where: { stockNumber } })` — uses YMM/color/vin to seed
- 3) Else tries `prisma.externalRepair.findFirst({ where: { stockNumber } })` — uses YMM/color
- 4) Creates a **placeholder Vehicle** with `status='archived'`, `completedAt=new Date()` so the detail page renders
- Used by `app/(app)/inventory/page.tsx:82` when a row in the inventory list is clicked

**After Phase 0:** Per CONTEXT, every InventoryVehicle row has a backfilled canonical Vehicle (orphan IVs become `status='inventory_only'`). So step 1 always hits. Steps 2-4 become dead code paths.

**Phase 0 treatment:**
- Leave the endpoint live during the 30-day audit window (legacy iOS builds may still call it)
- In 0.E: remove the endpoint, since direct `Link href={`/vehicles/${vehicle.id}`}` works
- Alternative: convert it to a thin proxy that just looks up via stockNumber and returns id — keep for safety, drop later

**One subtle point:** `app/(app)/inventory/page.tsx:82` currently calls `/api/vehicles/resolve` instead of linking directly. In 0.D, the inventory page reader rewires to query canonical Vehicle directly (now has Vehicle.id), so the inventory page can use `Link href={`/vehicles/${vehicle.id}`}` directly. The resolve endpoint becomes a vestige.

### Vehicle detail page surface (`app/(app)/vehicles/[id]/page.tsx`)

**Current state:** 1799-line client component. Three tabs (`overview` / `parts` / `history`) via `activeTab` state.

**Phase 0 changes:**
- Add persistent header (photo + YMM/Stock#/VIN + status pill) above the tab switcher
- Three new top-level tabs: Recon (contains old `overview` + `parts`), Inventory (new), Activity (renamed from `history`)
- URL `?tab=` param maps: `overview/parts/history` → `recon`, `inventory`, `activity`
- Default tab: read `?tab=` first → `?from=inventory` falls to inventory → otherwise recon
- "Previous history" banner when `vehicle.priorVehicleId !== null`
- Activity tab: filter chips for event type — pure client-side filter on the timeline already loaded from `/api/vehicles/[id]/history`

**This is a large refactor of a 1799-line file.** Planner should plan a careful extract — likely split into `_components/ReconTab.tsx`, `_components/InventoryTab.tsx`, `_components/ActivityTab.tsx`. Acknowledged in CONTEXT discretion section.

### Inventory page surface (`app/(app)/inventory/page.tsx`)

**395-line client component.** No visual UI change per CONTEXT. The only Phase 0 work here is:
- Change row-click handler (currently `await fetch('/api/vehicles/resolve')` then router.push) → direct `router.push(`/vehicles/${vehicle.id}?from=inventory`)` after 0.D (because every list row now is a canonical Vehicle with a real id)
- Type definition for `Vehicle` row stays the same (planner can extend later in Phase 2)

### CSV import path

**Confirmed:** `app/api/inventory/route.ts` POST `action=='import'` is the ONLY CSV/DealerCenter ingestion path. Triggered manually from the inventory page (per existing UI). No scheduled cron found. Search for "csv" / "import" turned up only the standard settings routes (dispositions, stages, lead-sources) which aren't related.

### Feature flag mechanism

**No existing feature flag system in the repo.** Env var pattern is used throughout (`process.env.*` referenced in `lib/twilio.ts`, `lib/r2.ts`, `lib/cloudinary.ts`, etc.). Recommended: single env var `DMS_READ_CANONICAL_VEHICLE` for 0.D cutover. Read once at module load in `lib/dms/vehicle/canonical-reader.ts`.

### ActivityLog usage pattern

**Confirmed:** 18+ files write to `prisma.activityLog.create({ data: { entityType, entityId, action, actorId, details } })`. No wrapper helper exists. Phase 0 follows the existing inline pattern. New event types Phase 0 introduces:
- `vehicle.canonical_backfill_merged` (from backfill script when IV merges onto recon)
- `vehicle.canonical_backfill_orphan_iv` (from backfill when orphan IV becomes inventory_only Vehicle)
- `vehicle.canonical_manual_merge` (from admin unmatched-review screen)
- `vehicle.dual_write` (optional — per-CSV-row from 0.C dual-write; may be too noisy, planner decide)
- `vehicle.reader_cutover_flipped` (single entry at 0.D cutover, actor = admin user who flipped)

### Recon-state files (PITFALLS §1 — flagged fragile)

Grep-verified that these only reference `Vehicle.id`:

- `lib/return-queue.ts` (79 lines): only touches `tx.vehicle` (line 24, 54), `tx.vehicleStage` (line 34, 41), `tx.activityLog` (line 64). Strategy A invariant holds — **no changes needed in Phase 0**.
- `lib/stage-notifications.ts` (76 lines): reads `prisma.vehicleStage.findUnique` (line 30), `prisma.user.findMany` (admins), writes `prisma.notification.createMany`. **No InventoryVehicle reference. No changes needed in Phase 0.**
- `lib/part-notifications.ts` (55 lines): reads `prisma.user.findMany` and `prisma.vehicle.findUnique` (line 25), writes notifications. **No InventoryVehicle reference. No changes needed in Phase 0.**

This is the Strategy A safety dividend: the fragile recon-state machinery never sees Phase 0.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two parallel Vehicle and InventoryVehicle rows linked by humans matching stockNumber | One canonical `Vehicle` row with absorbed inventory scalars | Phase 0 (Strategy A) | Locks in `Vehicle.id` as the universal vehicle identity; every later DMS phase attaches here |
| Inventory list reads `InventoryVehicle.findMany` directly | Reader gated by `DMS_READ_CANONICAL_VEHICLE`; canonical Vehicle filter `inventoryStatus IS NOT NULL` | 0.D cutover | Inventory list visually unchanged; data source rewired |
| `/api/vehicles/resolve` endpoint creates placeholder Vehicles on demand | Every IV pre-resolved at backfill; resolve becomes a thin lookup (then vestige) | 0.B → 0.E | Click-through latency drops; placeholder creation race eliminated |
| Click row in `/inventory` → resolve → push detail | Click row → direct `router.push(`/vehicles/${id}`)` | 0.D | One less round-trip on every inventory click |

**Deprecated/outdated:**
- `InventoryVehicle` model — drops in 0.E final migration after 30-day audit window
- `Vehicle.photos[]` array column — drops in 0.E (confirmed vestigial; no MediaAsset migration per CONTEXT)
- `/api/vehicles/resolve` placeholder-creation logic — dies in 0.E (endpoint can stay as thin proxy or also drop)

## Open Questions

1. **Should `Vehicle.inventoryStatus` be a separate column or share `Vehicle.status`?**
   - What we know: CONTEXT.md says Inventory tab and Recon tab show different statuses (Status pill on header shows... which one?). Existing `Vehicle.status` enum values are recon-domain (mechanic/detailing/content/publish/completed/awaiting_routing). Existing `InventoryVehicle.status` is inventory-domain (in_stock/in_recon/external_repair/sold/removed).
   - What's unclear: The header Status pill — does it show recon status or inventory status?
   - Recommendation: TWO separate columns (`Vehicle.status` recon-domain stays unchanged; new `Vehicle.inventoryStatus` is inventory-domain). Header pill shows `inventoryStatus` if it exists, else `status`. Planner should confirm with user at plan-check time.

2. **What does the canonical Vehicle row look like for an orphan IV that later gets recon-started?**
   - What we know: Orphan IV creates Vehicle with `status='inventory_only'` and `currentStageId=null`. CONTEXT says "Inventory tab shows full data; Recon tab shows empty state".
   - What's unclear: When user manually starts recon on this vehicle (mechanic-board "add to recon"), how does `status` transition from `inventory_only` to `mechanic`? Does existing recon-start code path handle this?
   - Recommendation: Phase 0 introduces `status='inventory_only'` as a new value. Verify the existing recon-start flow (likely `app/api/vehicles/[id]/route-stage/route.ts`) gracefully handles starting a stage from `inventory_only`. May need a small allowlist update.

3. **Prisma 6 raw-SQL embedded migration syntax for `CREATE UNIQUE INDEX CONCURRENTLY`?**
   - What we know: ARCHITECTURE §3 says Prisma supports custom SQL migrations but flags MEDIUM confidence.
   - What's unclear: Phase 0 may not need a unique index (per CONTEXT: dup VINs are intentional separate rows — VIN is NOT unique). So this is moot for VIN. But `legacyInventoryVehicleId` may want a unique index — and unique indexes on populated tables can lock.
   - Recommendation: Test the schema migration on a Supabase preview branch FIRST. If `npx prisma migrate dev` produces a non-concurrent unique index, override with a custom SQL migration. (Easier alternative: don't make `legacyInventoryVehicleId` unique — it's nullable and just an audit pointer.)

4. **`Vehicle.purchaseType` enum values: how do existing InventoryVehicle values map?**
   - What we know: `InventoryVehicle.purchaseType` has historical values "FLOORING", "CONSIGNMENT", "TRADE-IN" (raw strings, not enum). DMS plans `Vehicle.purchaseType` as enum `PURCHASED / TRADE_IN / CONSIGNMENT`.
   - What's unclear: "FLOORING" in InventoryVehicle is really "PURCHASED with active floorplan" — needs translation during backfill.
   - Recommendation: Backfill maps `"FLOORING" → "PURCHASED"` (mark with flooringStatus='active' in Phase 2 schema; for now just `purchaseType='PURCHASED'`). Document the mapping in the backfill script with a `// PHASE 0 NOTE:` comment. Planner should add a checklist item.

5. **30-day audit window: who owns "decision to decommission"?**
   - What we know: CONTEXT says 30-day audit window between 0.D and 0.E. Then drop `InventoryVehicle` table.
   - What's unclear: What signals decommission readiness? Zero reads on `InventoryVehicle` in Vercel logs? Manual user sign-off?
   - Recommendation: Planner builds a small checklist: (a) Vercel logs show zero `inventory_vehicles` table reads in last 7 days; (b) `VehicleMigrationMap.count` matches `InventoryVehicle.count` pre-backfill; (c) Smoke test of legacy redirect endpoint hits non-zero count (means legacy clients DID try old IDs but were caught — proves redirect is working). User signs off → 0.E proceeds.

6. **Activity tab data source — is `ActivityLog.entityType='vehicle'` the only source?**
   - What we know: PROJECT.md says ActivityLog is the polymorphic sink. Existing `app/api/vehicles/[id]/history/route.ts` queries `prisma.activityLog.findMany` for `entityType='vehicle'` (line 63) AND a second query for parts ActivityLog (line 75) tied to the vehicle's parts.
   - What's unclear: For the Activity tab, do we also want Opportunity-related events tied to this vehicle (sales messages, stage moves)? Per CONTEXT "Deal data on Activity tab — deferred to Phase 4" — so probably only direct ActivityLog hits.
   - Recommendation: Phase 0 Activity tab matches existing `history` route behavior (vehicle + parts ActivityLog). Filter chips operate over this same data. Planner: small reshape only.

## Sources

### Primary (HIGH confidence — codebase grep + upstream planning docs)

- `prisma/schema.prisma` — full schema read for FK inventory, Vehicle/InventoryVehicle model definitions
- `app/api/inventory/route.ts` — DealerCenter CSV importer (read in full)
- `app/api/vehicles/resolve/route.ts` — resolve endpoint (read in full)
- `app/(app)/inventory/page.tsx` — inventory list page (first 100 lines read)
- `app/(app)/vehicles/[id]/page.tsx` — vehicle detail page (first 100 lines + tab structure greps)
- `lib/inventory-status.ts` — recomputeInventoryStatus (read in full)
- `lib/return-queue.ts`, `lib/stage-notifications.ts`, `lib/part-notifications.ts` — read in full to confirm no InventoryVehicle reference
- Grep audits — `prisma.vehicle.*`, `prisma.inventoryVehicle.*`, `vehicleId` FK, `prisma.activityLog.*` (results inline above)
- `.planning/research/ARCHITECTURE.md` §3 (Strategy A migration path)
- `.planning/research/PITFALLS.md` §1 (Vehicle identity migrations)
- `.planning/PROJECT.md` (Implementation Notes — `Vehicle.photos[]` confirmed vestigial)
- `.planning/REQUIREMENTS.md` (VEH-01 through VEH-09)
- `.planning/phases/00-vehicle-identity-unification/00-CONTEXT.md` (user-locked decisions)

### Secondary (MEDIUM confidence — Prisma 6 / Postgres / Vercel behavior, training data only)

- Postgres ≥11 `ADD COLUMN` is metadata-only — established Postgres behavior
- Prisma 6 supports tsx-based standalone scripts using `prisma` client — established Prisma pattern
- Vercel env vars + redeploy as feature-flag mechanism — established Vercel pattern

### Tertiary (LOW confidence — flagged for validation)

- Exact syntax for Prisma 6 raw-SQL embedded migration (`CREATE INDEX CONCURRENTLY`) — verify on Supabase preview branch before encoding into the migration plan
- Whether Prisma 6 `migrate dev` generates `CREATE INDEX CONCURRENTLY` or plain `CREATE INDEX` — verify

## Metadata

**Confidence breakdown:**
- Codebase audit (grep results, file structure, call sites) — HIGH — direct grep on production codebase
- Strategy A migration pattern — HIGH — corroborated by ARCHITECTURE §3, PITFALLS §1, and grep-confirmed FK inventory
- Sub-phase boundaries (0.A → 0.E) — HIGH — follows ARCHITECTURE §3 with CONTEXT-specific adjustments (1-week dual-write, no MediaAsset migration)
- Specific Prisma 6 / Postgres / Vercel syntax — MEDIUM — training-data knowledge, no web verification this session
- Risk mitigations — HIGH — drawn from PITFALLS §1 + codebase audit

**Research date:** 2026-06-02
**Valid until:** Phase 0 cutover (estimated 30 days for stable codebase facts; revisit if upstream schema changes before 0.A)
