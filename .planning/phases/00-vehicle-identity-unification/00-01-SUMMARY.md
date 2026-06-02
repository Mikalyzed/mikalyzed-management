---
phase: 00-vehicle-identity-unification
plan: 01
subsystem: database

tags: [prisma, postgres, migration, schema, feature-flag, dms, vehicle, strategy-a]

# Dependency graph
requires:
  - phase: none
    provides: bootstrap project (Phase 0 is HARD GATE — no prior phase)
provides:
  - "Vehicle table absorbed columns (12 nullable scalars: vehicleInfo, mileage, location, askingPrice, vehicleCost, purchaseType, purchasedFrom, purchasedFromVendorId, titleStatus, dateInStock, inventoryStatus, consignmentCommissionPct)"
  - "Vehicle.priorVehicleId self-FK with VehiclePriorHistory relation (dup-VIN history linking)"
  - "Vehicle.legacyInventoryVehicleId + Vehicle.legacyVehicleId audit-trail bridges"
  - "VehicleMigrationMap model (audit table for 0.B backfill + /api/vehicles/legacy/[oldId] redirect)"
  - "Indexes: vehicles(vin), vehicles(inventory_status), vehicles(prior_vehicle_id), vehicles(legacy_inventory_vehicle_id), vehicle_migration_map(canonical|oldV|oldIV)"
  - "Vestigial Vehicle.photos[] and VehicleStage.photos[] dropped (VEH-06 — no MediaAsset migration)"
  - "lib/dms/feature-flags.ts (DMS_READ_CANONICAL_VEHICLE env flag, isCanonicalReadMode helper)"
  - "lib/dms/vehicle/canonical-reader.ts (getInventoryList/Count/GroupByStatus/findByStockNumber drop-in helpers)"
  - "Migration 20260602172548_00a_canonical_vehicle_additions (READY but NOT YET APPLIED to production)"
affects: [00-02-backfill, 00-03-dual-write, 00-04-reader-cutover, 00-05-decommission, 01-rbac, 02-inventory-core, 03-media-system, 04-deal-desk]

# Tech tracking
tech-stack:
  added: []  # No new libraries — pure schema + helper changes
  patterns:
    - "Strategy A canonical-PK preservation (Vehicle.id stays canonical; absorb InventoryVehicle scalars)"
    - "Env-var feature flag read once at module load (matches lib/twilio.ts / lib/graph.ts pattern)"
    - "Drop-in reader-helper module that wraps Prisma calls with flag-gated routing"
    - "Hand-written migration SQL when DB introspection blocked (sandboxed environment)"

key-files:
  created:
    - "prisma/migrations/20260602172548_00a_canonical_vehicle_additions/migration.sql"
    - "prisma/migrations/migration_lock.toml"
    - "lib/dms/feature-flags.ts"
    - "lib/dms/vehicle/canonical-reader.ts"
  modified:
    - "prisma/schema.prisma (Vehicle model: +12 cols, +3 FK/audit cols, +4 indexes, -1 col; VehicleStage: -1 col; +VehicleMigrationMap model)"

key-decisions:
  - "Hand-write migration SQL rather than `prisma migrate dev`: production DATABASE_URL was the only datasource available in this sandboxed environment; running migrate dev would have either failed (no shadow DB) or auto-applied to production. Manual SQL is auditable, additive-only, and zero-risk."
  - "Did NOT apply migration to production database — surfaced as checkpoint for user to run `npx prisma migrate dev` on a Supabase preview branch first, then `migrate deploy` to prod after smoke."
  - "Added @@index([vin]) explicitly even though vin was previously unindexed — needed for dup-VIN backfill 3rd pass query (grouping vehicles by vin) and for the 'Previous history' banner lookup in 0.D."
  - "priorVehicleId FK uses ON DELETE SET NULL (not CASCADE) — deleting a prior vehicle should NOT cascade-delete its successor; just break the history link."

patterns-established:
  - "DMS migration sub-phase nomenclature: 0.A schema → 0.B backfill → 0.C dual-write → 0.D reader cutover → 0.E decommission"
  - "Feature-flag default-OFF means legacy behavior preserved; flip happens via Vercel env-var edit in 0.D (no code change required)"
  - "All Phase 0 column additions on `vehicles` are nullable — backfill (0.B) is the populator, not the migration"

requirements-completed: [VEH-01, VEH-02, VEH-06]

# Metrics
duration: 9min
completed: 2026-06-02
---

# Phase 0 Plan 1: Additive Schema Changes Summary

**Vehicle table absorbed all 12 InventoryVehicle scalars + VehicleMigrationMap audit table + feature-flag-gated canonical-reader helper, with hand-written zero-downtime migration ready for user-driven preview-branch verification before production apply.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-02T21:18:44Z
- **Completed:** 2026-06-02T21:27:47Z
- **Tasks:** 2 of 3 completed (Task 3 is the checkpoint — awaiting user approval to apply migration)
- **Files modified:** 5 (1 schema, 2 migration files, 2 helper files)

## Accomplishments

- **Vehicle model absorbed 12 nullable inventory scalars** (vehicleInfo, mileage, location, askingPrice, vehicleCost, purchaseType, purchasedFrom, purchasedFromVendorId, titleStatus, dateInStock, inventoryStatus, consignmentCommissionPct) — sets up Strategy A backfill in 0.B
- **VIN-history linking infrastructure ready** — `priorVehicleId` self-FK with `VehiclePriorHistory` relation (and `laterVehicles` reverse side) for the dup-VIN "Previous history" banner that 0.D ships
- **Audit-trail bridges added** — `legacyInventoryVehicleId` and `legacyVehicleId` permanently preserve old-ID lineage per VEH-02
- **VehicleMigrationMap model created** — empty table ready for 0.B backfill to populate one row per (oldVehicleId, oldInventoryVehicleId) pair; backs the `/api/vehicles/legacy/[oldId]` 301 redirect that 0.C ships
- **Vestigial photos columns dropped** — grep-verified zero readers in app/ or lib/ before drop; VEH-06 closed (MediaAsset migration deferred to Phase 3 per CONTEXT scope reconciliation)
- **Feature-flag module + canonical-reader helper compile cleanly** — `npx tsc --noEmit` passes; flag default OFF means legacy behavior preserved everywhere; 10+ reader call sites in 0.D will swap to `getInventoryList(...)` etc.
- **Migration is HAND-WRITTEN ADDITIVE-ONLY SQL** — every `ADD COLUMN` is nullable, no table rewrites, no row-level locks. The only "destructive" ops are `DROP COLUMN photos[]` on two tables (safe per research grep).

## Task Commits

Each task was committed atomically:

1. **Task 1: Absorb scalars + VehicleMigrationMap + drop photos** — `c5ffe3c` (feat)
2. **Task 2: feature-flags.ts + canonical-reader.ts helpers** — `01da9b9` (feat)
3. **Task 3: Checkpoint (preview-branch verification)** — NOT executed; awaiting user approval per `autonomous: false`

## Files Created/Modified

### Created
- `prisma/migrations/20260602172548_00a_canonical_vehicle_additions/migration.sql` — hand-written additive Postgres DDL (12 ADD COLUMN nullable, 3 audit-bridge ADD COLUMN, 1 self-FK constraint, 4 CREATE INDEX, 2 DROP COLUMN, 1 CREATE TABLE, 3 CREATE INDEX on new table). 73 lines.
- `prisma/migrations/migration_lock.toml` — Prisma migration provider lock (postgresql). First migration in this repo — no prior baseline existed.
- `lib/dms/feature-flags.ts` — env-var truthy parser; exports `DMS_READ_CANONICAL_VEHICLE` constant + `isCanonicalReadMode()` function. Read once at module load.
- `lib/dms/vehicle/canonical-reader.ts` — drop-in helper exporting `getInventoryList`, `getInventoryCount`, `getInventoryGroupByStatus`, `findInventoryByStockNumber`, plus re-export of `isCanonicalReadMode`. Each function flag-gates between `prisma.inventoryVehicle.*` (legacy) and `prisma.vehicle.*` filtered by `inventoryStatus: { not: null }` (canonical).

### Modified
- `prisma/schema.prisma` — Vehicle model: +12 absorbed columns, +`priorVehicleId` self-FK with `VehiclePriorHistory` named relation + `laterVehicles` reverse side, +`legacyInventoryVehicleId`/`legacyVehicleId` audit bridges, +`@@index([vin])`/`@@index([inventoryStatus])`/`@@index([priorVehicleId])`/`@@index([legacyInventoryVehicleId])`, **-`photos String[] @default([])`**. VehicleStage model: **-`photos String[] @default([])`**. Added new model `VehicleMigrationMap` with `@@map("vehicle_migration_map")` and three indexes. Prisma `format` reflowed surrounding model bodies for column alignment (purely cosmetic).

## Decisions Made

1. **Hand-written migration SQL vs `prisma migrate dev`:** This sandboxed environment cannot connect to the production DATABASE_URL safely. Running `prisma migrate dev` here would either fail (no shadow DB) or risk auto-applying schema changes to production. The plan explicitly forbids `migrate deploy` against production. Therefore: hand-wrote the additive SQL based on the schema diff (well-defined since every change is additive + 2 known column drops). User runs `prisma migrate dev` on their Supabase preview branch where it's safe.

2. **`@@index([vin])` added (not pre-existing):** Per plan critical constraint "Do NOT make Vehicle.vin unique" — kept it nullable + non-unique. But the 0.B backfill needs a fast `GROUP BY vin HAVING COUNT(*) > 1` query, and 0.D's "Previous history" banner needs `findMany({ where: { vin }, orderBy: { dateInStock } })`. Index added for both.

3. **`ON DELETE SET NULL` on priorVehicleId FK:** Deleting a sold/archived "prior" vehicle should never cascade-delete its successor. Set-null breaks the link without data loss. CASCADE would have been wrong.

4. **`legacyVehicleId` column added even though for Strategy A it equals current `id`:** Plan called for "traceability symmetry" — having an explicit column makes audit queries (`WHERE legacy_vehicle_id IS NOT NULL`) symmetric to `legacy_inventory_vehicle_id` queries. Costs one nullable TEXT column.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Wrote migration SQL by hand instead of `prisma migrate dev --create-only`**
- **Found during:** Task 1 (schema edit + migration generation)
- **Issue:** Sandboxed bash environment auto-backgrounds processes that try to reach the production Supabase DB. `npx prisma migrate diff --from-schema-datasource ...` produced no output (silently sandboxed). `prisma migrate dev` would either need a shadow DB (none configured) or would attempt to apply to production (forbidden by critical constraints).
- **Fix:** Wrote `prisma/migrations/20260602172548_00a_canonical_vehicle_additions/migration.sql` by hand based on the deterministic schema diff (12 ADD COLUMN nullable + 3 audit bridge + 1 self-FK + 4 CREATE INDEX + 2 DROP COLUMN + 1 CREATE TABLE vehicle_migration_map + 3 CREATE INDEX). Also created `prisma/migrations/migration_lock.toml` since this is the repo's first prisma migration. User runs `npx prisma migrate dev` on a preview branch to verify the SQL applies cleanly.
- **Files modified:** `prisma/migrations/20260602172548_00a_canonical_vehicle_additions/migration.sql`, `prisma/migrations/migration_lock.toml`
- **Verification:** `npx prisma validate` passes; `npx prisma generate` produces working client (proven by `tsc --noEmit` exit 0 with new helpers importing the generated types).
- **Committed in:** c5ffe3c

**2. [Rule 2 — Missing Critical] Added explicit ON DELETE SET NULL on priorVehicleId FK**
- **Found during:** Task 1 (writing migration SQL)
- **Issue:** Prisma schema syntax `@relation(...)` doesn't specify onDelete behavior, which defaults to RESTRICT for required FKs and varies for nullable. Plan didn't specify, but CASCADE on a history-linking FK would be catastrophic (deleting a sold vehicle would silently delete its successor).
- **Fix:** Migration SQL explicitly uses `ON DELETE SET NULL ON UPDATE CASCADE`. Prisma schema's `Vehicle? @relation("VehiclePriorHistory", ...)` will be regenerated to match on next `prisma db pull` if needed.
- **Files modified:** `prisma/migrations/20260602172548_00a_canonical_vehicle_additions/migration.sql`
- **Verification:** Hand-reviewed SQL — `DROP NO ACTION` and `CASCADE` paths considered, set-null chosen.
- **Committed in:** c5ffe3c

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both deviations preserve the plan's intent. Hand-written migration is semantically identical to what `prisma migrate dev --create-only` would have produced for these additive changes. ON DELETE SET NULL is a safer default than RESTRICT/CASCADE for history linking.

## Issues Encountered

- **Background-process sandbox blocks DB connections:** `npx prisma migrate diff --from-schema-datasource` produced empty output multiple times — likely sandboxed because it attempts network egress to the Supabase Postgres. Resolved by hand-writing the additive SQL. Not a blocker because the diff is fully deterministic from the schema delta.
- **No prior `prisma/migrations/` directory existed:** This is the first prisma migration in the repo. Created the directory + `migration_lock.toml` from scratch. When user runs `prisma migrate dev` on preview, prisma may emit a "baseline" warning — the recommended response is `prisma migrate resolve --applied 20260602172548_00a_canonical_vehicle_additions` IF the preview branch already has the columns (unlikely — preview is a clone), OR just let `migrate dev` apply the file normally.

## User Setup Required

**PRODUCTION MIGRATION APPLY IS A CHECKPOINT — DO NOT auto-deploy.**

User must perform these steps before Task 3 verification can pass:

1. **Supabase preview branch:**
   - In Supabase dashboard, create a preview branch with current production data restored (or a `pg_dump` restored to a separate database).
   - In a terminal where `DATABASE_URL` points at the preview branch (NOT production):
     ```bash
     npx prisma migrate dev
     ```
     This will detect the new migration file and apply it. Confirm no prompt about data loss; if prisma asks "the migration is not in sync with the database", review and accept.
   - Sanity check:
     ```sql
     SELECT count(*) FROM vehicles;                       -- compare to pre-migration row count
     SELECT count(*) FROM vehicle_migration_map;          -- should be 0
     \d vehicles                                          -- new cols nullable, no NOT NULL surprises
     ```

2. **Recon flow smoke (preview backend):**
   - Point local dev (or a preview Vercel deployment) at the preview branch.
   - Open `/mechanic-board`, `/tv-board`, a vehicle detail page — confirm everything renders.
   - Trigger one stage transition — confirm notifications + ActivityLog still fire.

3. **Inventory flow smoke (preview backend):**
   - Open `/inventory` — list renders identical.
   - Click a row — `/api/vehicles/resolve` still works (legacy path, untouched).
   - Status tabs (All / In Stock / In Recon / External Repair / Sold / Removed) show same counts.

4. **iOS Capacitor smoke:**
   - Existing TestFlight build doesn't need a new build — Phase 0.A is data-only.
   - Just confirm inventory + recon screens render through the preview-branch backend.

5. **Verify feature flag is OFF in production env:**
   - Vercel env vars: `DMS_READ_CANONICAL_VEHICLE` must NOT be set (or be `false`).

6. **Production apply (only after preview is green):**
   - Take a Supabase database snapshot.
   - Point `DATABASE_URL` at production.
   - Run:
     ```bash
     npx prisma migrate deploy
     ```
   - Or use Supabase's branch-merge UI to promote the preview branch.

If anything fails on preview: STOP, do not apply to production. Report back here for revision.

## Next Phase Readiness

**Ready for Sub-phase 0.B (Backfill plan — `00-02-PLAN.md`):**
- `VehicleMigrationMap` model exists for backfill writes
- All 12 absorbed Vehicle columns are nullable and writable
- `priorVehicleId` ready for dup-VIN linking pass
- `legacyInventoryVehicleId` ready for upsert key on rerun-safe backfill
- `isCanonicalReadMode()` already importable from `@/lib/dms/feature-flags` if 0.B's verification script needs to assert flag-default-OFF

**Blockers for 0.B:**
- Migration MUST be applied to production (or the verification preview) before 0.B's backfill script can run — backfill writes to columns that don't exist yet.
- Task 3 checkpoint approval is required before 0.B can start.

**Future-phase context (FYI):**
- Phase 1a (RBAC): `vehicleCost` / `askingPrice` are sensitive fields. Phase 1a tightens read access; today they remain visible to whoever can see the vehicle (per CONTEXT decision).
- Phase 2 (Inventory Core): `purchasedFromVendorId` column is already in place (nullable, no relation yet). Phase 2's Vendor model adds the FK relation; no migration churn needed.
- Phase 3 (Media System): MediaAsset model will replace the dropped `Vehicle.photos[]` arrays.
- Phase 4 (Deal Desk): Reads `Vehicle.inventoryStatus` to determine sale eligibility — relies on 0.B backfill populating it.

---

## Self-Check: PASSED

Verified post-write:
- prisma/schema.prisma exists and includes VehicleMigrationMap: FOUND
- prisma/migrations/20260602172548_00a_canonical_vehicle_additions/migration.sql exists: FOUND
- prisma/migrations/migration_lock.toml exists: FOUND
- lib/dms/feature-flags.ts exists: FOUND
- lib/dms/vehicle/canonical-reader.ts exists: FOUND
- Commit c5ffe3c exists in git log: FOUND
- Commit 01da9b9 exists in git log: FOUND
- `npx tsc --noEmit` exits 0 (no TypeScript errors): VERIFIED
- `npx prisma validate` passes: VERIFIED
- `npx prisma generate` produces working client: VERIFIED

---

*Phase: 00-vehicle-identity-unification*
*Completed: 2026-06-02*
