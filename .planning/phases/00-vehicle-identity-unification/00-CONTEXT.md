# Phase 0: Vehicle Identity Unification - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Merge two parallel vehicle records (`Vehicle` recon + `InventoryVehicle` DealerCenter mirror) into one canonical row per physical car. **Strategy A locked:** `Vehicle.id` stays as canonical PK; `InventoryVehicle` scalar fields (cost, asking price, purchaseType, titleStatus, dateInStock, etc.) are absorbed onto `Vehicle`. `InventoryVehicle` is decommissioned after a 30-day audit window.

**User-facing deliverable:** click a row in the existing `/inventory` list → land on a unified `/vehicles/[id]` detail page with tabs (Recon / Inventory / Activity) that surfaces both recon AND inventory/financial info in one place.

**In scope:** schema additions, idempotent backfill, dual-write window, reader cutover, unified detail-page UI (tabs), orphan-review admin UI, dup-VIN history linking, legacy-ID redirect endpoint, iOS Capacitor build pre-cutover.

**Out of scope (deferred to later phases):** new inventory list columns (e.g., Cost, Days), CostAdd model, MediaAsset typed media, Deal model, MarketingPlacement syndication, RBAC permission upgrade.

</domain>

<decisions>
## Implementation Decisions

### Inventory list (`/inventory` page)
- Existing inventory tab and list already exist at `/inventory` — Phase 0 does NOT change the visual UI of the list
- Today's columns (Stock # / Vehicle / VIN / Color / Miles / Status / Type) stay as-is
- Phase 0 only **rewires the data source** so the list reads from the canonical `Vehicle` (via the absorbed inventory fields) instead of `InventoryVehicle` directly
- Column changes (Cost, Days-in-Stock, etc.) are deferred to later phases when there's actually new column data to add
- Status tabs (All / In Stock / In Recon / External Repair / Sold / Removed) remain
- The on-demand `/api/vehicles/resolve` bridge endpoint becomes vestigial after cutover (every InventoryVehicle row has a backfilled canonical Vehicle, so click-through is a direct lookup) — leave it as a legacy redirect during the 30-day audit window, then drop

### Vehicle detail page (`/vehicles/[id]`)
- **Persistent header (always visible regardless of tab):** photo + Year/Make/Model/Trim + Stock # + VIN + current Status pill
- **Top-level tabs:** Recon / Inventory / Activity
- **Default tab when arriving from `/inventory` list:** Inventory tab (since user came from the inventory entry point, show inventory info first)
- **Default tab when arriving from a recon link or mechanic-board:** Recon tab (preserve existing entry behavior)
- **Inventory tab content:** one scrollable view with grouped sections — `Money` (vehicle cost, asking price, purchase type), `Title` (status, location), `Stock info` (stock #, VIN, date in stock, days in stock, mileage), `Source` (purchased from / vendor, acquisition event detail). Everything visible by scrolling
- **Activity tab content:** unified timeline of everything (cost adds, photos uploaded, status changes, messages, deals, etc.) most recent first. Filter chips for narrowing by event type. Reads from existing `ActivityLog` polymorphic table
- **Recon tab content:** preserved as-is — current recon stage UI continues unchanged (stages, parts, checklists, current assignee, timer, approvals)

### Cutover & rollout plan
- **Dual-write window:** 1 week. After schema additions are deployed and backfill is verified, writes go to BOTH the old `InventoryVehicle` table AND the canonical `Vehicle` row for 7 days before reader cutover
- **Cutover timing:** flexible — no specific scheduling constraint locked. Decide closer to time when backfill verification + dual-write are both green. User has flexibility (small team, low usage outside business hours)
- **Users to coordinate with:** small team (1-5 people). Informal heads-up before cutover; no formal external rollout. iOS Capacitor build with new ID resolution logic shipped to TestFlight before cutover so iPhone users are on a build that handles canonical IDs
- **Smoke test approach:** BOTH automated and user-driven
  - **Automated post-deploy script** asserts row counts match (every InventoryVehicle row has a backfilled canonical Vehicle), sample opportunities resolve to the correct vehicle, sample sales attribution numbers match a pre-migration baseline export
  - **User-driven walkthrough (~15 min):** open `/inventory`, click a car, verify Inventory tab shows correct cost/price/title; click another car in recon stage, verify Recon tab works; trigger a stage transition; check that activity log on a vehicle includes recent events
- **Rollback plan:** database snapshot taken immediately before reader cutover; feature flag controls whether DMS code paths read from canonical Vehicle or fall back to legacy resolve. Flag-flip rollback is a 1-line config change, not a deploy. Rehearsed on a Supabase preview-branch clone of production data before live cutover

### Backfill matching & orphan handling
- **Primary match rule:** stock number. Consistent with existing `/api/vehicles/resolve` behavior; stock # is the join key both tables use today
- **InventoryVehicle rows with no recon Vehicle match (orphan IV):**
  - Create canonical Vehicle in `status = inventory_only` (no recon stages, no `currentStageId`)
  - Visible in `/inventory` list (unchanged)
  - Inventory tab on detail page shows full inventory data; Recon tab shows empty state ("not yet started in recon")
  - Surface in an admin **"unmatched vehicles" review screen** so user can manually re-attach if a stock # got typoed and there's actually a matching recon Vehicle with a different/typoed stock #
- **Recon Vehicle rows with no InventoryVehicle match (orphan V):**
  - Keep as-is with null inventory fields (cost, asking price, etc. stay null)
  - Inventory tab on detail page shows empty state ("no inventory data yet — was this car imported from DealerCenter?")
  - Surface in the same admin "unmatched vehicles" review screen so user can manually attach inventory data
- **Admin "unmatched vehicles" review screen** is part of Phase 0 scope. Shows both directions of orphans; user can search by Year/Make/Model/Trim and manually merge orphan pairs
- **Duplicate VIN (same VIN acquired twice across separate acquisition events):**
  - Create separate canonical Vehicle rows for each acquisition event (each gets its own cost/profit tracking, its own stockNumber, its own dateInStock)
  - On the newer Vehicle detail page, show a **"Previous history" banner** above the tabs: "This VIN was previously here as Vehicle X (acquired YYYY-MM-DD, sold YYYY-MM-DD) — view history"
  - Banner links to the old Vehicle's detail page (read-only context)
  - Implementation: `Vehicle.priorVehicleId` (nullable FK to a prior Vehicle row with same VIN) populated during backfill and on any new acquisition where VIN already exists in the system

### Claude's Discretion
- Exact backfill script structure (one-shot vs chunked, batch size)
- Migration ordering details within Phase 0.A (schema additions) — any safe sequence works
- Specifics of the Vercel feature flag mechanism (env var vs DB-config vs build flag)
- Exact UI styling of the new Inventory and Activity tabs (must match existing UI polish standard — custom dropdowns, slide-up sheets, etc. — per [[feedback-ui-polish-standard]] memory)
- Exact "unmatched vehicles" review screen UI — admin-only, doesn't need polish
- Whether the "Previous history" banner is a single sentence or a small card; match existing patterns

</decisions>

<specifics>
## Specific Ideas

- User's framing of success: "Go into inventory tab, click a vehicle, see everything in reference to that vehicle." This is the single most important user-visible deliverable of Phase 0
- Default-to-Inventory-tab is deliberate — the user comes from the inventory list, so inventory info is what they want to see first. Recon tab is one click away
- User explicitly punted on dup-VIN handling complexity ("idk this one I'm not too sure about") but landed on the recommended "separate rows + history banner" approach. Treat the banner as a deliberate Phase 0 deliverable, not optional
- User wants to handle orphan vehicles by *seeing the list and re-attaching*, not by losing them. Build the admin review screen — don't auto-archive or hide unmatched rows
- The recon flow is sacred — Phase 0 cannot break it. Mechanic board, TV board, parts notifications, stage transitions must function identically through the cutover

</specifics>

<deferred>
## Deferred Ideas

- **Inventory list column additions** (Cost, Days-in-Stock, others) — user said "I can edit this later." Phase 2 (Inventory Core) is the natural home when cost-add data + aging buckets are first-class
- **MediaAsset typed media** (exterior / interior / undercarriage / walkaround video / turntable video) — Phase 3 (Media System). Phase 0 just drops the vestigial `Vehicle.photos[]` column without migrating it to MediaAsset
- **Activity feed filter UI polish** — the basic filter chips on the Activity tab are in Phase 0 scope; deep filtering / saved-filter views are a Phase 8 (Reporting) concern
- **RBAC: who sees vehicle cost/price?** — Phase 1a (RBAC upgrade). Phase 0 shows inventory data to whoever can see the vehicle today; tightening cost visibility is a separate phase
- **Deal data on Activity tab** — Phase 4 (Deal Desk). Phase 0 Activity tab pulls from existing `ActivityLog` only; deal entries will start appearing automatically once Phase 4 writes them
- **Mobile vs desktop layout differences for tabs** — match existing UI patterns; deep mobile polish is part of the ongoing [[project-mobile-polish-pass]] memory work, not Phase 0 scope

</deferred>

---

*Phase: 00-vehicle-identity-unification*
*Context gathered: 2026-06-02*
