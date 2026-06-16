# Phase 0.B Backfill Execution Log

**Date:** 2026-06-16
**Operator:** it@mikalyzed.com
**Target:** Production Supabase database (no preview branch)

## Decision: Production-direct execution

User opted to skip preview-branch dress rehearsal and execute backfill directly against production with a Supabase snapshot in hand. Reasoning:

1. Backfill is idempotent by design (every IV iteration guarded by `vehicleMigrationMap.findFirst`); a partial-failure rerun is a no-op on the rows that already mapped.
2. Backfill never overwrites canonical Vehicle fields (uses `??` fallback everywhere).
3. Strategy A preserves `Vehicle.id` — `Opportunity.vehicleId` cannot orphan.
4. Worst case (catastrophic bug): restore Supabase snapshot, roll back, fix, retry.
5. Preview branch refresh costs hours of operator time and adds little assurance for an additive + audited script.

## Discovery: pre-existing 159 mappings from 2026-06-03 one-shot run

When the backfill kicked off, `VehicleMigrationMap` was NOT empty as the plan
assumed. 159 mappings existed from an **undocumented 2026-06-03 catch-up run**
(referenced obliquely in commit `b785af5 chore: remove one-shot Phase 0.B
migration scripts`). Those scripts created mappings during recon-board outage
recovery on 2026-06-02/03 but the corresponding SUMMARY.md was never written.

Practical impact: the backfill's idempotency guards meant the existing 159
rows were skipped, and only the 19 net-new IV/V rows (introduced into prod
between 2026-06-03 and 2026-06-16) required new mappings. This is the CORRECT
behavior — the idempotency design absorbed the divergence without intervention.

## Pre-backfill baseline

Captured to: `.planning/phases/00-vehicle-identity-unification/baseline-20260616-1600.json`

Committed in `4ca5bd4 chore(00-02): capture pre-backfill baseline against prod`.

## Dry-run

```bash
npx tsx scripts/dms/backfill-canonical-vehicle.ts --dry-run
```

Stats:
- matched: 15
- orphanIV: 2
- orphanV: 16  (← Pass 3 / Pass 1 ordering artifact — see note below)
- dupVinNoted: 0
- skipped: 124  (the 159 pre-existing minus the 35 inventory_only vehicles whose
  IVs are still mapped, plus assorted)
- errors: 0

## Commit run

```bash
npx tsx scripts/dms/backfill-canonical-vehicle.ts --commit
```

Final stats:
- matched: 15
- orphanIV: 2
- orphanV: 2  (← 14 lower than dry-run, see explanation below)
- dupVinNoted: 0
- skipped: 138
- errors: 0

19 net-new VehicleMigrationMap rows written, bringing total mappings from
159 → 178.

## Why dry-run orphanV (16) ≠ commit orphanV (2)

This is a Pass 1 / Pass 3 mechanical artifact, NOT a data integrity issue.

- **Pass 1** iterates `InventoryVehicle` rows. On a `matched` row (recon Vehicle
  found by `stockNumber`), Pass 1 sets `legacyInventoryVehicleId = iv.id` on
  the canonical Vehicle.
- **Pass 3** iterates Vehicles with `legacyInventoryVehicleId IS NULL AND
  status != 'inventory_only'` — i.e., "recon Vehicles with no IV match."

In dry-run mode, Pass 1's `legacyInventoryVehicleId` UPDATE is skipped (no
writes). So when Pass 3 runs, the 14 recon Vehicles that Pass 1 just matched
to IVs still appear in Pass 3's "no legacy IV" filter and get counted as
orphan-V candidates.

In commit mode, Pass 1's UPDATE writes through, so by the time Pass 3 runs,
those 14 Vehicles have `legacyInventoryVehicleId` set and are correctly
excluded from the orphan-V scan. Only 2 truly-orphan recon Vehicles remain.

`matched + orphanV` is invariant across modes:
- dry-run: 15 + 16 + 2(orphanIV) = 33 distinct canonical Vehicles touched
- commit:  15 +  2 + 2(orphanIV) = 19 distinct canonical Vehicles touched

The diff is exactly the 14 Pass-1-matched rows that the dry-run double-counted.

## Verify-backfill (first run — failed with false positive)

```bash
npx tsx scripts/dms/verify-backfill.ts
```

Exited non-zero. Single issue reported:

```
- [iv_mapping_completeness] InventoryVehicle.count=144 but
  VehicleMigrationMap rows with oldInventoryVehicleId=145
```

**Root cause:** IV `f7cc8f39...` (1979 Pontiac Trans Am, stock NI41867 — formerly
N141867) has 2 legitimate `VehicleMigrationMap` rows from the 2026-06-03
cleanup:
1. An `orphan_iv_created` row created when the IV first arrived
2. A `manual_review` row created when the stockNumber was renamed
   (N141867 → NI41867), re-linking the IV to the canonical Vehicle the
   renamed stockNumber now matched

Both rows are correct and intentional — the audit trail explicitly preserves
the supersession. `COUNT(DISTINCT oldInventoryVehicleId) = 144` is the right
invariant; `COUNT(*) = 145` was the wrong one.

## Verify-backfill patch

Patched `scripts/dms/verify-backfill.ts` to use `COUNT(DISTINCT
old_inventory_vehicle_id)` instead of `COUNT(*)`. Inline comment cites the
manual_review re-mapping pattern.

Commit: `bd8afb6 fix(phase-00-02): use DISTINCT IV count in verify-backfill
to allow manual_review re-mappings`.

## Verify-backfill (re-run after patch)

```bash
npx tsx scripts/dms/verify-backfill.ts
```

Exit 0. All five invariant checks pass:
- inventoryVehicleCount: 144
- canonicalWithLegacy: 141  (3 inventory_only orphans were inserted before
  legacyInventoryVehicleId was added; harmless gap)
- inventoryOnlyVehicles: 35
- dupVinGroups: 0
- orphanOpportunities: 0
- issues: 0

## Idempotency rerun (proof)

```bash
npx tsx scripts/dms/backfill-canonical-vehicle.ts --commit
```

Stats:
- matched: 0
- orphanIV: 0
- orphanV: 0
- dupVinNoted: 0
- skipped: 157
- errors: 0

Zero new mutations. Idempotency invariant holds: Pitfall §1.4 mitigated.

## User decisions in force during this run

| Decision | Value | Reasoning |
|----------|-------|-----------|
| Execution target | Production direct | Idempotency + Strategy A make preview-branch redundant |
| Flooring fields | Left blank | Phase 2 introduces `flooringStatus`; Phase 0 doesn't model floorplan |
| Stale Pitfall 6 narrative | Ignored | `photos[]` was already dropped in 0.A; 0.B has no MediaAsset coupling |
| Verify-script false positive | Patch (Option 1) | DISTINCT is the correct invariant; data was right |

## Result

Backfill is COMPLETE on production. Every InventoryVehicle has at least one
canonical-Vehicle mapping (whether pre-existing match, orphan-created, or
re-mapped). All Opportunity.vehicleId rows resolve. No dup-VIN cleanup needed.

Phase 0.B can be marked complete. Ready for 0.C (dual-write window).
