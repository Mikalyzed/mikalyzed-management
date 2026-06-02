# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-02)

**Core value:** One canonical vehicle record drives the entire dealership — every cost, photo, conversation, deal, document, and credit pull attaches to that one record, and every action is logged with who did it.
**Current focus:** Phase 0 — Vehicle Identity Unification (HARD GATE)

## Current Position

Phase: 0 of 10 (Vehicle Identity Unification)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-06-02 — ROADMAP.md created, 11-phase structure approved, REQUIREMENTS traceability populated

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent roadmap-level decisions affecting current work:

- Phase 0: ROADMAP encodes Strategy A (keep `Vehicle.id` as canonical, absorb `InventoryVehicle` fields onto it) — disagreement with PROJECT.md "Promote InventoryVehicle" note; awaiting explicit user confirmation before Phase 0 planning starts
- Phase 1 split into 1a (RBAC) + 1b (jobs + storage consolidation + staging Postgres) per research recommendation
- Phase 5 + Phase 6 require written attorney sign-off in `.planning/` before feature flag flips on in production
- Provider locking (BoldSign vs Anvil for Phase 5; 700Credit vs eLEND for Phase 6) is a phase entry prerequisite — apply to both providers in parallel during Phase 0/1 to avoid onboarding blocking later phases

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- **Phase 0 strategy confirmation needed**: ROADMAP encodes Strategy A (Vehicle.id canonical); PROJECT.md Key Decisions table currently says InventoryVehicle should be canonical. Resolve before Phase 0 planning.
- **FL statutory verification pending**: accountant call (surtax cap, doc-fee taxable, sourcing rule, trade-in credit) needed before Phase 4 code; attorney call (ESIGN, FCRA, GLBA, HSMV) needed before Phase 5/6 code; chart-of-accounts mapping needed before Phase 7 code.
- **Provider onboarding lead time**: 700Credit/eLEND and BoldSign/Anvil onboarding takes days, not minutes — apply during Phase 0/1 to avoid blocking Phase 5/6.

## Session Continuity

Last session: 2026-06-02
Stopped at: ROADMAP.md + STATE.md written, REQUIREMENTS traceability populated, awaiting commit
Resume file: None
