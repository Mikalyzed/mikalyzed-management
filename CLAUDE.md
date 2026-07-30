# CLAUDE.md — Mikalyzed Management / DMS

> Source-of-truth onboarding + working guide for this repo. Written for both AI agents (Claude Code) and human collaborators.
> **This file is verified against the actual codebase, not the planning docs.** Where `.planning/` and the code disagree, the code wins and the divergence is called out below.
> Last verified against code: 2026-07-30.

---

## 1. What this is

A full **Dealer Management System (DMS)** for Mikalyzed Auto Boutique, being built to replace DealerCenter. It is a live, production Next.js app that runs the dealership's day-to-day: vehicle reconditioning, inventory, parts, external repairs, scheduling (mechanic / content / porter / transport), a sales CRM, a unified messaging inbox (SMS + voice + Instagram + email), media pipeline, AI helpers, a **Deal Desk** (retail-cash + wholesale deals with an FL tax engine), and an **agentic operations layer** (Section 6) that detects problems, creates the follow-up work, and asks humans to confirm rather than remember.

**Core value:** one canonical vehicle record drives the entire dealership — every cost, photo, conversation, deal, task, and repair attaches to that one record, and every mutation is logged with who did it (`ActivityLog`).

**Product direction (owner's words):** "I want the system to tell my admin what to do, not the other way around." Every new feature should push toward that: rules detect, the system stages the work, a human confirms. See Section 6.

Single-tenant (Mikalyzed only). Solo developer/operator plus a shop coordinator; this doc exists so additional collaborators (human or AI) can align.

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

There is **no test script and no lint script.** `npx tsc --noEmit` is the only automated quality gate — run it after every change and confirm exit code 0 (check the exit code itself, not a piped command's). Migration/data scripts run ad-hoc via `npx tsx scripts/...`.

**Env** lives in `.env`. Migrations need `DIRECT_URL` (direct Postgres); the pooled `DATABASE_URL` hangs `prisma migrate`. **Migration workflow** (non-TTY `migrate dev` is blocked): generate SQL with `prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `prisma migrate deploy`, then `prisma generate`. **After every `prisma generate`, kill and restart the dev server** — a running server keeps the old client and 500s on new columns. This has caused repeated false "bugs"; treat it as mandatory.

Key vars: `DATABASE_URL`, `DIRECT_URL`, `ANTHROPIC_API_KEY`, Twilio (`TWILIO_*`), Microsoft Graph (`MS_*`), Meta/Instagram (`IG_*`/`META_*`), R2 (`R2_*`), `CLOUDINARY_*`, `RESEND_API_KEY`, `EASYPOST_API_KEY`, `DMS_READ_CANONICAL_VEHICLE`.

**Local recovery:** if localhost 500s but `npm run build` passes, the dev server is holding stale state — kill the :3000 process, `rm -rf .next`, `npm run dev`.

---

## 3. Architecture & conventions

- **App Router**, two route groups:
  - `app/(app)/*` — authenticated screens; `(app)/layout.tsx` mounts the role-based `Nav` (collapsible icon rail with a "Boards" popup directory), the global `VoicePhone` softphone, the global `AskAI` dialog, and the mesh-gradient backdrop. The layout refreshes the user's role from `/api/auth/me` on load (stale role cookies caused wrong navigation once). Two layout modes: **deal focus** (contract page hides the global sidebar) and **embedded** (`window.self !== window.top` → chrome-free render).
  - Public routes outside the group: `/login`, `/tv` (shop display board), `/u/[token]` (tokenless customer upload portal), `/privacy`, `/terms`, `/data-deletion-status`.
- **API routes** under `app/api/*`. Each route enforces its own auth — middleware only redirects unauthenticated **page** requests to `/login`; it does **not** protect `/api/*`. Every API route must call `getSessionUser()` and check the role itself. `requireRole(role, [...])` treats `admin` as always allowed.
- **Domain logic in `lib/`**, not in components.
- **Shared modals are the rule.** One implementation per interaction, mounted wherever needed: `components/RouteVehicleModal.tsx` (routing), `ExternalRepairModal.tsx` (external repair lifecycle), `PartDetailModal.tsx` (part detail/actions), `BoughtPartModal.tsx` (purchased in store), `SmartTaskModal.tsx` (AI task creation), `ConfirmDialog.tsx` (all confirms/alerts — **never use `window.confirm`/`alert`**; native popups are banned). If a page grows its own copy of one of these interactions, replace it with the shared component.
- **Roles** are plain strings in `lib/constants.ts`: `admin, mechanic, detailer, content, sales, sales_manager, coordinator, porter, shop_coordinator`. Role boundaries for `shop_coordinator` are documented in Section 6.
- **Big files are the norm.** `vehicles/[id]/page.tsx` ~8,500 lines; recon board, mechanic schedule, meeting board, dashboard each ~1,500–3,000. Extract components when practical; several modals above were extracted this way.
- **Prisma schema is the source of truth** — ~57 models in `prisma/schema.prisma`.

### Design language (enforced by the owner in review — follow exactly)

- Cards: white `var(--bg-card)`, `1px solid var(--border)`, radius 12–14. Section labels ("eyebrows"): 11px / 600 / uppercase / 0.07em letter-spacing / muted. Hero numbers: 26px / 700 / `tabular-nums`.
- Stock numbers always render as mono chips: `ui-monospace` 10.5px/600 on `var(--bg-primary)` with a 1px border, radius 6, e.g. `#N101146`.
- Statuses are dot pills: 10.5px/650, radius 100, 6px colored dot. Palette is soft tints only: blue `#eaf0fe/#1d4ed8` (actions), amber `#fdf3e7/#92400e`, green `#f0fdf4/#16a34a` (confirm verbs), red `#fdecef/#b91c1c` (problems).
- **Do not introduce black buttons with lime (`#dffd6e`) text.** The owner is moving away from that pairing; new action buttons use the compact soft-tint style (~6px vertical padding, 12–13px text). Existing dark tabs (parts/external filter pills, active state dark with **white** text) are fine.
- Multi-option choices are **joined segmented bars** (equal-width segments, blue active), not loose pill groups: stage pickers, date-push chips (`+1d | +3d | +1wk | +2wk | Date…`).
- Cards are **car-first**: stock chip on top, vehicle name as the one bold line (full width, single-line ellipsis), detail text below in muted 12–12.5px, actions on the right edge as quiet blue text links (`Open ›`, `Create ›`, `Send ›`) or a full-width tinted button at the bottom on mobile.
- Mobile: every card grid uses `minmax(min(Npx, 100%), 1fr)` so nothing overflows a 375px screen. Buttons that pair go 50/50. Labels are Title Case; no emoji in UI; no lowercase label runs.

---

## 4. Data model (real state)

`prisma/schema.prisma`, grouped. Highlights:

**Vehicle / recon (the spine)**
- `Vehicle` — canonical record. Recon `status` (mechanic/detailing/content/publish/awaiting_routing/external/completed/inventory_only/archived) plus `inventoryStatus` (in_stock/in_recon/external_repair/sold/removed). Absorbed the legacy InventoryVehicle scalars (cost, price, flooring fields, consignment). Recent additions: `routingProposal Json?` (coordinator's routing request: `{stage, byId, byName, at, checklist?, estimatedHours?, notes?}` — cleared on routing).
- `InventoryVehicle` — legacy DealerCenter mirror, cut over 2026-07-16, retained read-only until ~2026-08-15, then decommission.
- `VehicleStage` — one row per stage visit; `checklist Json` items shaped `{item, done, note, type?, fields?, data?, addedByMechanic?, approved?, assigneeId?, assigneeName?, fromPart?, fromPlan?, doneAt?}`. `doneAt` is stamped **server-side** in the stage PATCH on the transition to done (since 2026-07-28; earlier completions have no timestamp). `scopeName` labels templated stages ("New Vehicle Inspection").
- `VehiclePlan` + `VehiclePlanStep` — per-vehicle **game plan** (master roadmap). Exactly one step `active`; advancing a step closes its auto-created admin follow-up task and opens the next. Steps are typed: `kind generic|task|external` with `actionStage`/`actionShop` and an idempotence stamp `actionCreatedAt`; active typed steps render one-tap "create the real work" chips, and the route-stage API auto-attaches a queued `task`-step when the car reaches its stage.
- `Part` — pipeline statuses `requested → sourced → ready_to_order → ordered → received`. Tracking fields (`tracking`, `epTrackerId`, `trackingCarrier`, `trackingStatus`, `trackingUpdatedAt`, `expectedDelivery`) are fed by EasyPost. `installTaskCreatedAt` is the single source of truth for "this part's install is handled" — every surface (routing prefill, dashboard rows, watchlist rules) filters on it, which is what prevents duplicate install tasks.
- `ExternalRepair` — statuses `pending → sent → in_progress → ready → returned`. `pending` means **planned, car still on the lot** (it must not flip the car to at-external — `lib/inventory-status.ts` enforces this). `partOnly` = the component went out, not the car. `plannedSendDate` = when it's supposed to leave (a passed date triggers alerts). `followUps Json` entries are `{date, note, by, etaDays, calculatedDeadline}` — `by` (author) and `etaDays` (days added vs the prior expected date) are stamped server-side since 2026-07-30; earlier entries are anonymous.
- `MediaAsset`, `CostAdd` (+ categories), `Partner`, `TaskApproval`, `StageConfig`/`ChecklistTemplate`/`StageTemplate`, `WeeklyPlanSnapshot`, `MeetingPlanExample` (few-shot memory for the meeting smart input).

**Tasks & missions**
- `Task` (`tasks_board`) — board tasks. `assigneeId`, `stockNumbers Json`, plus **mission links**: `externalRepairId`, `transportRequestId`, `missionType` (`deliver` = car going out, `retrieve` = bringing it back), `selfTransport` (ride handled informally — "we drove it ourselves"). A linked task renders as a checkpoint stepper on the coordinator dashboard and can only be completed when the linked records prove the work happened.
- `TransportRequest` — tow/transport queue. Missions create these prefilled (vehicle, VIN, pickup/delivery, task title as the note); `scheduledDate` empty = "unscheduled", which the watchlist chases.

**Ops** — `PorterEntry`/`PorterTask`, `CalendarItem`/`CalendarAssignee`, `Event`/`EventSection`/`EventTask`.

**Deals (Phase 4, live)** — `Deal`, `DealLineItem`, `DealTrade`, `Business`, `DealStipulation`/`StipTemplate`. All deal math in `lib/deals.ts` (single source; `FL_COUNTY_SURTAX` must never be hand-edited without accountant verification). Deal/business APIs gated `requireRole(role, ['sales_manager'])`.

**CRM** — `Pipeline`/`PipelineStage`, `Contact`, `Opportunity` (+ notes/tasks), `ActivityEvent`, `VehicleInterest`, `Disposition*`, `RoundRobin*`, `LeadSource`.

**Messaging** — `Message`, `Call`, `EmailSubscription`, `UploadLink`, `ConnectedInstagramAccount`.

**Cross-cutting** — `Notification`, `ActivityLog` (polymorphic audit sink — write to it for anything notable, including system-initiated actions), `User` (has `dashboardSeenAt` — the "New For You" acknowledgment cutoff).

**Models that do NOT exist yet:** `Document`/`DocumentTemplate`, `CreditApplication`/`CreditPull`, QBO sync models, `Job`/`JobAttempt` queue, `Permission`/`RolePermission`/`UserPermission`.

---

## 5. Integrations (real state)

All wrapped in `lib/`, config-guarded (no-op / 503 when keys are absent):

| Service | Module | State |
|---------|--------|-------|
| Twilio SMS/MMS | `lib/twilio.ts`, `lib/twilio-validate.ts` | Live. Per-rep `from` number; deal stip-request SMS. |
| Twilio Voice | `app/api/voice/*`, `components/VoicePhone` | Live. |
| Microsoft Graph / Outlook | `lib/graph.ts` | Live. Send-as-user + inbox webhooks. |
| Meta / Instagram DMs | `app/api/instagram/*` | Built but **paused** mid-debug. |
| Anthropic Claude | `app/api/inventory/ask`, `ai/polish-description`, `fetch-listing`, `generate-ad`, `reports/meeting/interpret`, `tasks/assess`, `vehicles/[id]/plan/parse` | Live. Haiku (`claude-haiku-4-5-20251001`) with forced tool calls for all structured extraction. Grounding rule: the model only structures the user's words + system data; it never invents shops, people, cars, or specs. |
| EasyPost Tracking | `lib/easypost.ts`, `lib/refresh-part-tracking.ts` | Live (production key). Free-text tracking fields are sanitized (`extractTrackingCode`), trackers created on the fly, statuses refreshed lazily (>30 min stale) from the parts GET and report builds. Carrier-says-delivered while the part is still "ordered" triggers alerts. |
| Cloudflare R2 | `lib/r2.ts` | Live. Presigned uploads. |
| Cloudinary | `lib/cloudinary.ts` | Live. MMS media. |
| Resend | `lib/email.ts` | Live. Notification + stip emails. |
| Supabase | `lib/supabase.ts` | Postgres host. |

---

## 6. The agentic operations layer (built 2026-07-28 → 07-30)

This is the newest and most product-defining part of the system. The owner's goal is a hands-off operation: **rules detect, the system stages the work, humans confirm.** AI handles language only; state changes are deterministic. Nothing is created silently, and completion is proof-based wherever records exist to prove it.

### 6.1 The reminder stack (how anything gets chased)

1. **Attention card** (dashboard, admin + shop coordinator) — live queues waiting on a decision, grouped into three area sections (Recon Board / Parts / External) with issue sub-sections and inline execution: route or approve a routing request, assign installs, confirm received, approve/decline parts (decline requires a reason or removes the part), add a stranded car to recon, get a return date. `app/api/dashboard/route.ts` + `AttentionCard` in `app/(app)/dashboard/page.tsx`.
2. **Issues Detected** (`/watchlist`, nav for admin + coordinator) — every rule breach as a card with its fix executable in place. Rules live in `lib/reports/bottlenecks.ts` and re-fire until the data is fixed (no dismiss button by design). Current rules: external overdue; external out with **no return date**; never sent (5-day grace, or immediately once a `plannedSendDate` passes); waiting on parts that already arrived; part stuck in requested 7+ days; carrier delivered but not received; hand-written duplicate install tasks; received parts with no install plan (car not in recon / sold — 21-day window); tow requested with no pickup date; tow pickup date passed; game plan stalled 7+ days.
3. **Morning meeting** (`/reports/meeting`) — the full report + the same rule cards + the smart input (natural language → proposed multi-step plan → confirm; learns from confirmed plans via `MeetingPlanExample`).
4. **Auto follow-ups** — priority admin tasks the system creates itself (game-plan steps, stranded parts, return pickups) and closes itself when the underlying state resolves.
5. **New For You** (coordinator dashboard, top card) — everything assigned since the user's last "Got It" tap (`User.dashboardSeenAt`). Nothing enters someone's world unannounced. Admin sees a read-only preview of the coordinator's unacknowledged list on `/dashboard?view=coordinator`.

### 6.2 Missions (linked coordination tasks)

A task linked to an `ExternalRepair` (and optionally a `TransportRequest`) renders as a **checkpoint stepper**: External logged → Transport arranged → At the shop (deliver), or Ready at shop → Ride back arranged (tow **or** "Ourselves") → Back home (retrieve). Each step is actionable in place; creating the tow asks "when is the pickup?" (unscheduled is allowed and then chased); marking Sent with no ride arranged asks **"who took it?"** and logs the answer to the follow-up history. The task has **no Done button until the linked records confirm the work** — then a full-width "Complete" appears. When an external is marked Ready, a retrieve mission is auto-created for the coordinator.

### 6.3 Smart task creation (`+ Add Task` on the coordinator board)

`app/api/tasks/assess/route.ts` + `SmartTaskModal`. Natural language in → the AI classifies the execution shape and the server resolves the car (stock match or fleet word-match; ambiguity returns a tap-to-answer question, e.g. three Grand Nationals) and assignee (named person, else the coordinator). Four shapes:
- **coordination** → task born linked to a (created or reused) external at the named shop → mission stepper
- **part_request** → a real `Part` in requested status → the parts pipeline, not a to-do
- **shop_work** → appended to the car's active mechanic checklist (or held as a task for routing carry-over)
- **simple** → a plain task with a bottom "Complete" button
Preview mirrors the exact card that will be created; nothing is written until the human confirms.

### 6.4 Roles: what the shop coordinator (Lenny) can and cannot do

**Can:** source parts (paste link → admin approval; or "In Store" purchase with receipt/price), add parts and tasks anywhere, browse all mechanic lanes and check off tasks, assign installs, create/mark install tasks, run missions (create tows, mark externals sent/ready/returned, log follow-ups), use `+ Add Task`, see Issues Detected, and **request routing**: marking a car Returned opens the full Send-to-Recon modal (stage + tasks + templates + hours) whose primary button files the package as a `routingProposal` instead of routing.
**Cannot (admin-only):** approve sourced parts, set ordered/received, route cars (his requests appear on the admin routing queue as "Lenny requests Detailing · 4 tasks · 2h" — one-tap **Approve** executes his package as filed; tapping the car opens the routing modal to review/override), see the part-approval queue, delete parts, see money.

His dashboard **is** his board: New For You → Attention (his rows only) → Assignments (tabbed: tasks + missions / source queue) → Waiting on External. Admin mirror at `/dashboard?view=coordinator`.

### 6.5 Recon flow policies (changed 2026-07-29)

- **No silent default checklists, anywhere.** The old 8-item fallback is dead. A car enters recon only with explicitly chosen tasks/templates (the Add Vehicle form blocks submit without them; APIs 400 with guidance). Sold-delivery keeps its own list.
- **External returns resume, not restart.** Re-adding a car that is out at external parks it in **Pending Routing** (same as marking the repair returned). Routing a parked car back to the stage type it was skipped from restores that stage's checklist with its done-progress (60-day safety window). The interrupted stage's unfinished tasks surface in the routing modal for carry-over review.
- **Follow-up discipline on externals:** pushing an expected-back date requires "what did the shop say" and stamps who + days-added; the first estimate needs no note. Pending repairs plan a send date ("Going Out" chips); Mark Sent flips the car out.

### 6.6 The autonomy ladder (agreed direction, partially built)

Rung 1 (current): AI proposes, human confirms every write. Rung 2 (next): auto-create the reversible (follow-ups, part requests, Not-Scheduled externals) behind a per-action-type settings dial, with a "System did this · Undo" strip on the dashboard; anything that moves a car, assigns a person, or spends money stays confirm-first. Rung 3: auto-close with review-by-exception. Guardrails that make this safe already exist: idempotence stamps (`actionCreatedAt`, `installTaskCreatedAt`), dedup guards (409 on duplicate installs), draft-not-commit verbs (pending externals, unassigned tasks), and ActivityLog attribution.

---

## 7. Roadmap — reconciled status (code = truth; `.planning/ROADMAP.md` is stale)

| Phase | Planned scope | Real status |
|-------|---------------|-------------|
| **0. Vehicle unification** | One canonical `Vehicle` | **Cut over 2026-07-16.** Legacy table read-only until ~2026-08-15, then decommission. |
| **1a. RBAC upgrade** | Permission tables + `requireCan()` | Not started. Role-string checks; shop_coordinator boundaries are hand-enforced per route (Section 6.4). |
| **1b. Jobs + storage consolidation** | `Job` queue + cron | Not started. EasyPost refresh is lazy-on-read instead of scheduled. |
| **2. Inventory core** | CostAdd, flooring, VIN intake, aging | Largely shipped. Flooring accrual job needs 1b. |
| **3. Media + syndication** | `MediaAsset`, syndication | MediaAsset shipped; syndication not built. |
| **4. Deal Desk** | Deals + FL tax + trades + worksheet | **Largely shipped 2026-07-24.** Retail-cash + wholesale, deal jacket (`/deals/[id]`), contract/finalize page, FL tax engine (6% + county surtax), auto fee sheet, 4 trades, real front/back gross, financing calc, stipulations with SMS/email upload links, fund/cancel with double-funding guard. **Left off at:** payments/deposits (QBO deposit link planned), Notes/Files/Journal tabs on the jacket, wholesale direct-create, sales rep on deal, mobile layouts for deal pages. Surtax baseline + fee taxability await accountant verification. Known deferred debt: chained round-trips in jacket saves, heavy `DEAL_DETAIL_INCLUDE` refetch on every PATCH, deals list `take: 200` no pagination, 4 duplicate contact pickers, `dealAccess` duplicated across routes — batch when next touching. The deal page also still has **window-resize lag** after a first optimization pass; profiling React re-renders is the queued next step. |
| **5. Documents + e-sign** | pdf-lib + BoldSign/Anvil | Not started. Attorney sign-off required before go-live. |
| **6. Credit applications** | 700Credit/eLEND | Not started. Attorney sign-off required. |
| **7. QuickBooks sync** | Push funded deals | Not started. Needs accountant chart-of-accounts mapping. |
| **8. Reporting + AI** | Canned reports + AskAI | Inventory status report (JSON/PDF) + AskAI over inventory live. Morning meeting board live. **In progress (uncommitted):** per-person weekly team activity + shop KPIs (`lib/reports/team-activity.ts`, `lib/reports/kpis.ts`, `/api/reports/team`, Reports page sections) — being built, review before shipping. Caveat: per-task completion attribution only exists from 2026-07-28 onward. |
| **9. Cutover & go-live** | Dual-entry, import, runbook | Not started. |

**Locked product decisions:** keep `Vehicle.id` canonical; cash + outside financing only (no BHPH); `Contact.contactType` promotes lead → customer (no Customer table); integrate—don't build—the regulated pieces (credit, e-sign, accounting, VIN data); phases 5–6 need written attorney sign-off before production.

**Agentic layer — next planned slices (in rough priority):**
1. Autonomy dial + "System did this" strip (rung 2, Section 6.6).
2. Auto-complete game-plan steps and mission checkpoints from system events (external returned → matching step done; stage completed → step done).
3. Per-car "mission file" — one screen composing the car's game plan, open missions, parts, externals, transport (partially exists as the vehicle jacket's Recon tab: Open Tasks & Missions + Parts + unified timeline with part/task dots).
4. Return-matching rule: when a car returns from external, compare the shop's work description to the interrupted checklist (reuse `lib/install-task-match.ts`) and offer to clear the now-done tasks.
5. Extend New For You beyond the coordinator to all roles (one-line role change).
6. Fill the empty "Sold Vehicle Inspection" mechanic template and add a standard "Detail" template (empty templates are hidden from pickers).

---

## 8. Known gaps & tech debt

- **No automated tests, no lint.** `tsc` only. Deal/document/credit flows cannot tolerate silent failures — a testing strategy is overdue.
- **Attribution history:** checklist `doneAt` and follow-up `by`/`etaDays` only exist for events after 2026-07-28/30. Older records are honestly blank — do not backfill invented names.
- **Silent error swallowing** in fire-and-forget integration calls. Acceptable for recon; unacceptable for money/legal flows.
- **Uneven webhook signature validation** (Twilio partially, Instagram has bypass paths, Graph `clientState` needs a cross-check).
- **Mega page files** — extract as you touch (the shared-modal extractions are the pattern to follow).
- **Deal-desk deferred debt** — see the Phase 4 row above.
- **Deploy-race UX:** rapid pushes redeploy Vercel and in-flight fetches can fail mid-swap. Client fetches in new code use tolerant JSON parsing and a one-retry refresh helper (`fetchDashboardFresh`) — follow that pattern for new fetches.
- **No background job queue, no APM, no rate limiting.**
- **`vehicles/[id]/v1/page.tsx`** is a retained legacy detail page — redundant.
- **Data paper-cuts:** DealerCenter CSV import can't distinguish sold from deleted; a Storage tab for customer-owned cars is planned (2 known orphans); `returnQueue` refactor superseded in practice by the resume-from-external flow but old stale entries may still exist.
- One inactive-but-listed account, "Meta App Reviewer", still appears in team pickers (owner has been offered deactivation; pending decision).

---

## 9. Working conventions (house rules)

**Process**
- **Never `git commit` / `git push` without explicit confirmation** — the operator tests locally first. Exception pattern in practice: when the operator is actively testing on the live site and says so, small follow-up fixes in the same thread ship without re-asking. When in doubt, ask.
- **Schema before code on deploys:** apply the Prisma migration to the prod DB *before* pushing the schema commit (Vercel auto-deploys). Then restart the local dev server (see Section 2).
- **Data-fix scope discipline:** when authorized to fix specific rows, fix only those. If the same bug exists elsewhere, list the other rows and ask — never generalize silently. Log manual data fixes to `ActivityLog` with a reason.
- **Destructive actions never sit one click away** — overflow menus, edit mode, or a `ConfirmDialog` with a typed reason where the API demands one (external repair deletes require a reason and write the audit entry first).
- **Clarify scope (mobile / desktop / both)** before UI edits when the request doesn't say.
- **Buttons/labels must read as actions, not states** ("Mark Installed ›" or an empty checkbox — never a green "✓ Installed" label on an un-done row).
- **Every skipped step is a question, not a shrug** — if a user bypasses part of a flow the system expected (e.g. Sent with no transport), capture the missing fact with one required prompt instead of silently accepting.

**Product / UX**
- Match the surrounding spacing, padding, and rhythm of any screen you touch.
- Native-feeling polish is the bar: custom dropdowns/popovers (never native `<select>` for new work, never `window.confirm`), slide-up sheets, segmented controls, multi-select filters. See Section 3 design language.
- **AI features must stay grounded in real user input + system data.** Never invent vehicle specs, history, shops, or people — false-advertising and audit risk. All AI extraction uses forced tool calls with "use ONLY the text" system prompts, and creations are confirm-first.
- Overdue/critical items sort first in any list that mixes states.

**GSD planning system**
- `.planning/` is managed by the GSD workflow (`/gsd:*` skills). Treat ROADMAP/REQUIREMENTS as a completeness checklist, not a sequence; verify against code and prefer this file's Section 7 for real status.

---

## 10. Where to look first

| I want to… | Start at |
|------------|----------|
| Understand the data model | `prisma/schema.prisma` |
| See the recon workflow | `app/(app)/vehicles/page.tsx` (board), `vehicles/[id]/page.tsx` (detail; Recon tab = tasks/parts/timeline) |
| The agentic layer end-to-end | Section 6 above; `app/(app)/dashboard/page.tsx`, `app/(app)/watchlist/page.tsx`, `lib/reports/bottlenecks.ts` |
| Missions / linked tasks | `components/SmartTaskModal.tsx`, `app/api/tasks/assess/route.ts`, mission stepper in `dashboard/page.tsx`, `Task` model links |
| Game plans | `app/api/vehicles/[id]/plan*`, PlanBlock in `app/(app)/reports/meeting/page.tsx` |
| External repair lifecycle | `components/ExternalRepairModal.tsx`, `app/(app)/external/page.tsx`, `lib/external-repair-flow.ts` |
| Parts pipeline + tracking | `app/(app)/parts/page.tsx`, `lib/parts-ui.ts`, `lib/easypost.ts`, `lib/refresh-part-tracking.ts` |
| Routing (incl. proposals) | `components/RouteVehicleModal.tsx`, `app/api/vehicles/[id]/route-stage`, `propose-route` |
| Auth/RBAC | `lib/auth.ts`, `lib/constants.ts`, `middleware.ts` |
| Add an integration | `lib/` (mirror `twilio.ts` / `easypost.ts` patterns) |
| Vehicle migration / legacy | `lib/dms/`, `scripts/dms/` |
| Deal Desk | `app/(app)/deals`, `deals/[id]`, `deals/[id]/finalize`; `lib/deals.ts`; `app/api/deals` |
| Sales CRM | `app/(app)/leads`, `contacts`, `customers`, `pipelines`; `lib/crm.ts` |
| Messaging inbox | `app/(app)/conversations`, `app/api/{messages,sms,instagram,voice,email}` |
| Reports | `app/(app)/reports`, `lib/reports/*` |
