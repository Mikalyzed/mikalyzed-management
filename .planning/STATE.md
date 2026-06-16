# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02)

**Core value:** One canonical vehicle record drives the entire dealership — every cost, photo, conversation, deal, document, and credit pull attaches to that one record, and every action is logged with who did it.
**Current focus:** Phase 0 — Vehicle Identity Unification (HARD GATE)

## Current Position

Phase: 0 of 10 (Vehicle Identity Unification)
Plan: 2 of 5 in current phase (00-02 backfill complete on production; ready for 00-03 dual-write)
Status: 00-02 complete — production VehicleMigrationMap fully populated, idempotency proven, verify-backfill green
Last activity: 2026-06-16 — 00-02-PLAN.md executed against production: 4-pass idempotent backfill ran successfully (15 matched + 2 orphan IV + 2 orphan V + 19 net-new rows on top of 159 pre-existing from undocumented 2026-06-03 catch-up); verify-backfill patched to use DISTINCT IV count for legitimate manual_review re-mappings, now exits 0; Strategy A invariant verified (0 orphan Opportunities)

Progress: [████░░░░░░] 40% (2 of 5 Phase 0 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: ~1h 35m
- Total execution time: ~3h 9m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 0 | 2 of 5 | ~3h 9m | ~1h 35m |

**Recent Trend:**
- Last 5 plans: 00-01 (9 min, 2 tasks + 1 pending checkpoint), 00-02 (~3h, 3 tasks, 5 files)
- Trend: 00-02 took significantly longer due to production-direct execution + pre-existing-mapping discovery + verify-script false-positive patch

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent roadmap-level decisions affecting current work:

- Phase 0: ROADMAP encodes Strategy A (keep `Vehicle.id` as canonical, absorb `InventoryVehicle` fields onto it) — disagreement with PROJECT.md "Promote InventoryVehicle" note; awaiting explicit user confirmation before Phase 0 planning starts
- Phase 1 split into 1a (RBAC) + 1b (jobs + storage consolidation + staging Postgres) per research recommendation
- Phase 5 + Phase 6 require written attorney sign-off in `.planning/` before feature flag flips on in production
- Provider locking (BoldSign vs Anvil for Phase 5; 700Credit vs eLEND for Phase 6) is a phase entry prerequisite — apply to both providers in parallel during Phase 0/1 to avoid onboarding blocking later phases

Decisions made during Phase 0 plan 1 (00-01):

- **00-01: Hand-wrote migration SQL** instead of running `prisma migrate dev` because (a) production was the only DATABASE_URL available, (b) sandboxed bash blocks DB introspection commands, and (c) plan critical constraints forbid auto-applying migrations to production. SQL is deterministic and additive-only. User applies via `prisma migrate dev` on Supabase preview branch.
- **00-01: Added `@@index([vin])` on Vehicle** — needed for 0.B backfill's dup-VIN third pass (`GROUP BY vin HAVING COUNT(*) > 1`) and 0.D "Previous history" banner lookup. VIN remains NULLable and NON-unique per CONTEXT dup-VIN rule.
- **00-01: `ON DELETE SET NULL` on `vehicles.prior_vehicle_id` FK** — deleting an archived prior vehicle should never cascade-delete its successor; just break the history link.
- **00-01: Added `legacy_vehicle_id` audit column** even though Strategy A makes it equal to `id` for backfilled rows — gives audit queries symmetry with `legacy_inventory_vehicle_id`. Cost: one nullable TEXT column.

Decisions made during Phase 0 plan 2 (00-02):

- **00-02: Production-direct execution (no preview-branch dress rehearsal)** — User opted to skip the planned Supabase preview-branch refresh because (a) backfill is idempotent by design — partial-failure rerun is safe; (b) backfill never overwrites canonical fields (`??` fallback); (c) Strategy A preserves Vehicle.id so Opportunity.vehicleId cannot orphan; (d) Supabase snapshot in hand provides rollback. Cost-benefit favored direct execution.
- **00-02: Flooring fields left blank during backfill** — Phase 2 introduces `flooringStatus` and flooring accrual; Phase 0 has no floorplan model to populate. CostAdd backfill in Phase 2 will populate.
- **00-02: Pre-existing 159 mappings discovery absorbed via idempotency** — `VehicleMigrationMap` was NOT empty pre-backfill; 159 rows existed from undocumented 2026-06-03 catch-up scripts (since deleted in commit `b785af5`). Backfill's `findFirst` guard correctly skipped them and only wrote 19 net-new mappings for vehicles introduced after 2026-06-03. Idempotency design absorbed the divergence without intervention.
- **00-02: verify-backfill Check 1 patched to use COUNT(DISTINCT old_inventory_vehicle_id)** — original `COUNT(*)` invariant was wrong because legitimate `manual_review` audit rows (e.g., IV f7cc8f39 / stock NI41867 stockNumber rename on 2026-06-03) produce >1 map row per IV. New invariant: every InventoryVehicle is mapped AT LEAST ONCE.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- **Phase 0 strategy confirmation needed**: ROADMAP encodes Strategy A (Vehicle.id canonical); PROJECT.md Key Decisions table currently says InventoryVehicle should be canonical. Resolve before further Phase 0 planning iterations.
- **3 inventory_only Vehicles with NULL `legacyInventoryVehicleId`**: created during 2026-06-03 catch-up before the audit bridge column was added. They have `VehicleMigrationMap` rows but lack the canonical-side back-reference. 0.C can ignore (no functional impact) or backfill the column from `VehicleMigrationMap.canonicalVehicleId`.
- **FL statutory verification pending**: accountant call (surtax cap, doc-fee taxable, sourcing rule, trade-in credit) needed before Phase 4 code; attorney call (ESIGN, FCRA, GLBA, HSMV) needed before Phase 5/6 code; chart-of-accounts mapping needed before Phase 7 code.
- **Provider onboarding lead time**: 700Credit/eLEND and BoldSign/Anvil onboarding takes days, not minutes — apply during Phase 0/1 to avoid blocking Phase 5/6.

## Session Continuity

Last session: 2026-06-16
Stopped at: 00-02-PLAN.md complete (5 commits: 217c2c7, 2151ffb, 4ca5bd4, bd8afb6, eabcfff + SUMMARY commit e13725d). Production backfill is committed and verify-backfill is green. Ready for 00-03 dual-write window.
Resume file: .planning/phases/00-vehicle-identity-unification/00-02-SUMMARY.md (see "Next Phase Readiness" section)
