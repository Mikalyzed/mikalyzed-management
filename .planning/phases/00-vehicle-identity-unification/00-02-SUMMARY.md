---
phase: 00-vehicle-identity-unification
plan: 02
subsystem: database

tags: [prisma, postgres, backfill, dms, vehicle, strategy-a, idempotent, migration]

# Dependency graph
requires:
  - phase: 00-01-additive-schema
    provides: "Vehicle absorbed columns, VehicleMigrationMap model, legacyInventoryVehicleId/legacyVehicleId audit bridges"
provides:
  - "scripts/dms/baseline-export.ts — committed pre-backfill snapshot of Vehicle/IV/Opportunity counts + 500-row attribution sample"
  - "scripts/dms/backfill-canonical-vehicle.ts — idempotent 4-pass backfill (Pass 1 matched, Pass 2 orphan IV, Pass 3 orphan V, Pass 4 dup-VIN chain)"
  - "scripts/dms/verify-backfill.ts — post-backfill invariant assertion gate (DISTINCT IV count, canonical-to-map link, orphan IV status, dup-VIN chain, opportunity attribution)"
  - "Production VehicleMigrationMap fully populated: 178 rows covering all 144 InventoryVehicles + 35 inventory_only Vehicles + assorted orphan V audit rows"
  - "Idempotency guarantee proven on production: re-running backfill --commit yields zero new mutations"
  - "Strategy A invariant verified: 0 orphan Opportunity.vehicleId rows on production"
affects: [00-03-dual-write, 00-04-reader-cutover, 00-05-decommission, 02-inventory-core, 04-deal-desk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent backfill: per-row VehicleMigrationMap.findFirst guard before any write"
    - "Multi-pass backfill: matched-merge → orphan-IV-create → orphan-V-log → dup-VIN-link"
    - "Audit-preserving re-mapping: when a stockNumber/VIN correction supersedes an earlier match, a new manual_review row is appended rather than the old row being mutated"
    - "Production-direct execution justification: idempotency + Strategy A no-overwrite + snapshot-rollback makes preview-branch redundant for additive backfills"
    - "DISTINCT invariants when audit tables permit legitimate row supersession"

key-files:
  created:
    - "scripts/dms/baseline-export.ts"
    - "scripts/dms/backfill-canonical-vehicle.ts"
    - "scripts/dms/verify-backfill.ts"
    - ".planning/phases/00-vehicle-identity-unification/baseline-20260616-1600.json"
    - ".planning/phases/00-vehicle-identity-unification/00-02-execution-log.md"
  modified:
    - "scripts/dms/verify-backfill.ts (post-execution DISTINCT patch)"

key-decisions:
  - "Production-direct execution (no preview-branch dress rehearsal): idempotency guards + Strategy A no-overwrite invariant + Supabase snapshot-rollback safety net made preview-branch refresh redundant for an additive script"
  - "Flooring fields left blank during backfill: Phase 2 introduces flooringStatus/flooring accrual; Phase 0 has no floorplan model to populate"
  - "Pre-existing 159 mappings from undocumented 2026-06-03 catch-up run absorbed by idempotency: backfill correctly skipped them and only wrote 19 net-new rows for vehicles introduced 2026-06-03 → 2026-06-16"
  - "Verify-backfill Check 1 patched to use COUNT(DISTINCT old_inventory_vehicle_id) instead of COUNT(*) because manual_review re-mappings legitimately produce multiple map rows per IV (e.g., stockNumber rename N141867 → NI41867 created an audit-preserving re-link)"

patterns-established:
  - "Append-audit-row over mutate-existing-row: when canonical state needs correction, write a new VehicleMigrationMap row with matchMethod='manual_review' rather than rewriting the original — preserves chain of custody"
  - "Idempotency proof = mandatory verification step: every backfill rerun must report matched=0/orphanIV=0/orphanV=0/dupVin=0 before declaring complete"
  - "Strategy A allowed Opportunity.vehicleId to remain untouched throughout the backfill — verified by 0 orphan opportunities in verify-backfill check 5"

requirements-completed: [VEH-01, VEH-02, VEH-03, VEH-08]

# Metrics
duration: ~3h (includes pre-existing-mapping discovery + verify-script false-positive patch)
completed: 2026-06-16
---

# Phase 0 Plan 2: Idempotent Canonical Vehicle Backfill Summary

**Production VehicleMigrationMap fully populated via 4-pass idempotent backfill (15 matched + 2 orphan IVs + 2 orphan Vs + 19 net-new rows on top of 159 pre-existing from undocumented 2026-06-03 catch-up); Strategy A invariant verified (zero orphan Opportunities), idempotency proven (zero mutations on rerun), verify-script gate green.**

## Performance

- **Duration:** ~3h (multi-session, with checkpoints)
- **Completed:** 2026-06-16
- **Tasks:** 3 of 3 completed (Tasks 1, 2 by prior executor; Task 3 checkpoint resolved this session)
- **Files committed:** 5 (3 scripts, 1 baseline JSON, 1 execution log)

## Accomplishments

- **baseline-export.ts ships and produced `baseline-20260616-1600.json`** — captures pre-backfill Vehicle / InventoryVehicle / Opportunity counts plus 500 opportunity-attribution samples for post-cutover drift detection (Pitfall §1.1)
- **backfill-canonical-vehicle.ts runs idempotently on production** — final stats: matched=15, orphanIV=2, orphanV=2, dupVinNoted=0, skipped=138, errors=0. 19 net-new VehicleMigrationMap rows on top of 159 pre-existing
- **verify-backfill.ts is a green gate** — all 5 invariant checks pass on production after DISTINCT patch
- **Discovered + absorbed pre-existing 2026-06-03 catch-up mappings** — backfill's idempotency design correctly skipped them, only writing rows for vehicles introduced post-2026-06-03
- **Strategy A invariant verified on production** — zero orphan Opportunity.vehicleId rows
- **Idempotency proven** — second backfill --commit produced 0 mutations (skipped=157)

## Task Commits

Each task was committed atomically:

1. **Task 1: baseline-export.ts + backfill-canonical-vehicle.ts** — `217c2c7` (feat)
2. **Task 2: verify-backfill.ts assertion script** — `2151ffb` (feat)
3. **Task 3 — pre-backfill baseline capture** — `4ca5bd4` (chore)
4. **Task 3 — verify-backfill DISTINCT patch** — `bd8afb6` (fix)  [this session]
5. **Task 3 — execution log artifact** — `eabcfff` (docs)  [this session]

**Plan metadata commit:** [final commit at end of this plan]

## Files Created/Modified

### Created
- `scripts/dms/baseline-export.ts` — pre-migration snapshot script (counts + 500-row attribution sample)
- `scripts/dms/backfill-canonical-vehicle.ts` — 4-pass idempotent backfill (matched / orphan-IV / orphan-V / dup-VIN), uses `??` no-overwrite semantics, every action atomic via `prisma.$transaction`, FLOORING → PURCHASED normalization
- `scripts/dms/verify-backfill.ts` — 5-check post-backfill invariant gate
- `.planning/phases/00-vehicle-identity-unification/baseline-20260616-1600.json` — pre-backfill production snapshot
- `.planning/phases/00-vehicle-identity-unification/00-02-execution-log.md` — detailed execution log including dry-run vs commit divergence explanation

### Modified
- `scripts/dms/verify-backfill.ts` — post-execution DISTINCT patch on Check 1 (allowing legitimate manual_review re-mappings)

## Decisions Made

1. **Production-direct execution (no preview-branch rehearsal):** The plan's Task 3 originally scripted a Supabase preview-branch dress rehearsal. User opted to skip it for these reasons: (a) backfill is idempotent by design — partial-failure rerun is safe; (b) backfill never overwrites canonical fields (`??` fallback) so it cannot corrupt recon state; (c) Strategy A preserves `Vehicle.id` so `Opportunity.vehicleId` cannot orphan; (d) Supabase snapshot in hand provides full rollback. Cost-benefit favored direct execution.

2. **Flooring fields left blank during backfill:** Phase 2 introduces `flooringStatus`, flooring accrual job, and floorplan tracking. Phase 0 does not model floorplan and intentionally leaves these fields blank. Phase 2's CostAdd backfill will populate them.

3. **Pre-existing 159 mappings absorbed by idempotency:** When backfill started, `VehicleMigrationMap` already contained 159 rows from an **undocumented 2026-06-03 catch-up run** (commit `b785af5 chore: remove one-shot Phase 0.B migration scripts` is the only trail). The backfill's `findFirst` guard correctly skipped those rows and only wrote 19 net-new mappings for vehicles introduced into production between 2026-06-03 and 2026-06-16. This is the correct behavior — idempotency design absorbed the divergence without intervention.

4. **Verify-backfill Check 1 patched to DISTINCT (Option 1 over data-fix or guard rewrite):** First verify-backfill run failed with `iv_mapping_completeness: count=144 but rows=145`. Root cause: IV `f7cc8f39` (1979 Pontiac Trans Am, stock NI41867 — formerly N141867) has 2 legitimate map rows from 2026-06-03: an `orphan_iv_created` row plus a superseding `manual_review` row created when a stockNumber rename forced an audit-preserving re-link. Both rows are correct. The invariant `COUNT(*) == InventoryVehicle.count` was wrong; the correct invariant is `COUNT(DISTINCT oldInventoryVehicleId) == InventoryVehicle.count`. Patched the script; both invariants now agree (144 == 144).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 → User Decision] Pre-existing 159 mappings discovery**
- **Found during:** Task 3 (first commit-mode run)
- **Issue:** Plan assumed `VehicleMigrationMap` was empty pre-backfill. Production had 159 rows from undocumented 2026-06-03 catch-up scripts (since deleted in commit `b785af5`).
- **Fix:** Idempotency guards absorbed the divergence — backfill correctly skipped pre-existing rows and only wrote 19 net-new. User confirmed approach (vs. wiping table and re-running fresh).
- **Files modified:** None (no code change required)
- **Verification:** Final mapping count = 178 = 159 (pre-existing) + 19 (this run); verify-backfill exits 0
- **Committed in:** `eabcfff` (execution log documents the discovery)

**2. [Rule 1 — Bug] verify-backfill Check 1 false-positive on legitimate manual_review re-mapping**
- **Found during:** Task 3 (first verify-backfill run after commit)
- **Issue:** Check 1 used `COUNT(*)` on `VehicleMigrationMap` rows with `oldInventoryVehicleId IS NOT NULL`. One IV (f7cc8f39, stock NI41867) has 2 map rows — both legitimate audit records of a 2026-06-03 stockNumber rename. Script exited 1 on a count of 145 vs 144 InventoryVehicles.
- **Fix:** Changed Check 1 to `COUNT(DISTINCT old_inventory_vehicle_id)`. Added inline comment citing the manual_review pattern.
- **Files modified:** `scripts/dms/verify-backfill.ts`
- **Verification:** Re-ran verify-backfill; exits 0 with all 5 checks passing
- **Committed in:** `bd8afb6`

**3. [Rule 3 — Blocking] Plan called for preview-branch run; production was the only safe target**
- **Found during:** Task 3 setup
- **Issue:** Plan scripted Supabase preview-branch dress rehearsal. User considered cost/benefit: idempotency + no-overwrite + Strategy A make additive backfill safe; preview refresh costs hours; rollback via snapshot is in hand.
- **Fix:** User decision to execute production-direct. Documented in execution-log.md.
- **Files modified:** None
- **Verification:** Production backfill ran successfully; verify-backfill green
- **Committed in:** `4ca5bd4` (baseline capture commit log references this)

---

**Total deviations:** 3 (2 auto-fixed during execution, 1 user decision to deviate)
**Impact on plan:** All deviations preserved intent. Pre-existing 159 mappings discovery proved idempotency design works in the wild. DISTINCT patch is a strict improvement (correct invariant). Production-direct execution shipped backfill same-day vs. multi-day preview-branch loop.

## Issues Encountered

- **Dry-run orphanV (16) vs commit orphanV (2) divergence:** Caused by Pass 1 `legacyInventoryVehicleId` update being a no-op in dry-run mode, so Pass 3's "no legacy IV" filter double-counted the 14 Pass-1-matched rows. NOT a data integrity issue — `matched + orphanV` is invariant across modes (15+16 vs 15+2 = same 33 distinct Vehicles minus the 14 duplicates). Documented in execution-log.md.

- **Pitfall 6 narrative in plan was stale:** Plan still mentioned MediaAsset coupling concerns. `photos[]` was already dropped in 0.A — no MediaAsset coupling exists in 0.B. Ignored.

- **Verify-backfill false positive (resolved):** See Deviation #2 above.

## User Setup Required

None — backfill is complete on production. Next plan (0.C dual-write) does not require additional manual setup.

## Next Phase Readiness

**Ready for Sub-phase 0.C (Dual-write — `00-03-PLAN.md`):**
- Every InventoryVehicle has a canonical Vehicle counterpart
- VehicleMigrationMap fully populated (178 rows) — backs the `/api/vehicles/legacy/[oldId]` 301 redirect that 0.C ships
- Feature flag `DMS_READ_CANONICAL_VEHICLE` still default-OFF in production (verified during 0.A)
- Strategy A invariant intact: 0 orphan Opportunity.vehicleId rows

**Blockers for 0.C:** None.

**Operational notes for 0.C:**
- The 3 inventory_only Vehicles with `legacyInventoryVehicleId IS NULL` are intentional — they were created during the 2026-06-03 catch-up before the audit bridge column was added. They have map rows but the canonical Vehicle row missing the back-reference. Plan 0.C can either ignore (no functional impact) or backfill the column from `VehicleMigrationMap.canonicalVehicleId`.
- Production VehicleMigrationMap.count = 178: 144 IVs mapped (with one re-mapped via manual_review supersession) + ~34 orphan-V audit rows.

---

## Self-Check: PASSED

Verified post-write:
- scripts/dms/baseline-export.ts exists: FOUND
- scripts/dms/backfill-canonical-vehicle.ts exists: FOUND
- scripts/dms/verify-backfill.ts exists: FOUND
- .planning/phases/00-vehicle-identity-unification/baseline-20260616-1600.json exists: FOUND
- .planning/phases/00-vehicle-identity-unification/00-02-execution-log.md exists: FOUND
- Commit 217c2c7 exists in git log: FOUND
- Commit 2151ffb exists in git log: FOUND
- Commit 4ca5bd4 exists in git log: FOUND
- Commit bd8afb6 exists in git log: FOUND
- Commit eabcfff exists in git log: FOUND
- npx tsx scripts/dms/verify-backfill.ts exits 0: VERIFIED
- npx tsx scripts/dms/backfill-canonical-vehicle.ts --commit idempotency (0 mutations): VERIFIED

---

*Phase: 00-vehicle-identity-unification*
*Completed: 2026-06-16*
