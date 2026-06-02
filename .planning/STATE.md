# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02)

**Core value:** One canonical vehicle record drives the entire dealership — every cost, photo, conversation, deal, document, and credit pull attaches to that one record, and every action is logged with who did it.
**Current focus:** Phase 0 — Vehicle Identity Unification (HARD GATE)

## Current Position

Phase: 0 of 10 (Vehicle Identity Unification)
Plan: 1 of 5 in current phase (00-01 schema additions code-complete; checkpoint awaiting user to apply migration on Supabase preview branch)
Status: Awaiting checkpoint approval (00-01 Task 3 = human-verify preview-branch migration apply + smoke)
Last activity: 2026-06-02 — 00-01-PLAN.md executed: Vehicle absorbed 12 InventoryVehicle scalars, VehicleMigrationMap created, photos[] dropped, feature-flag + canonical-reader helpers added, migration SQL hand-written (NOT applied to production)

Progress: [██░░░░░░░░] 20% (1 of 5 Phase 0 plans code-complete; production apply pending checkpoint)

## Performance Metrics

**Velocity:**
- Total plans completed: 1 (code-complete; migration not yet applied)
- Average duration: 9 min
- Total execution time: 9 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 0 | 1 of 5 | 9 min | 9 min |

**Recent Trend:**
- Last 5 plans: 00-01 (9 min, 2 tasks + 1 pending checkpoint)
- Trend: First plan — baseline established

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

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- **CHECKPOINT (Phase 0 plan 1, Task 3):** Migration `20260602172548_00a_canonical_vehicle_additions` is code-complete and committed but NOT YET APPLIED to production. User must (a) clone production to a Supabase preview branch, (b) run `npx prisma migrate dev` against the preview branch, (c) smoke-test recon + inventory flows against preview, then (d) `npx prisma migrate deploy` against production. Plan 00-02 (backfill) cannot start until prod migration is applied.
- **Phase 0 strategy confirmation needed**: ROADMAP encodes Strategy A (Vehicle.id canonical); PROJECT.md Key Decisions table currently says InventoryVehicle should be canonical. Resolve before Phase 0 planning.
- **FL statutory verification pending**: accountant call (surtax cap, doc-fee taxable, sourcing rule, trade-in credit) needed before Phase 4 code; attorney call (ESIGN, FCRA, GLBA, HSMV) needed before Phase 5/6 code; chart-of-accounts mapping needed before Phase 7 code.
- **Provider onboarding lead time**: 700Credit/eLEND and BoldSign/Anvil onboarding takes days, not minutes — apply during Phase 0/1 to avoid blocking Phase 5/6.

## Session Continuity

Last session: 2026-06-02
Stopped at: 00-01-PLAN.md complete (2 tasks committed: c5ffe3c, 01da9b9). Task 3 is a `checkpoint:human-verify` — user must apply migration to Supabase preview branch and smoke-test before production deploy. SUMMARY.md written.
Resume file: .planning/phases/00-vehicle-identity-unification/00-01-SUMMARY.md (see "User Setup Required" section for migration apply steps)
