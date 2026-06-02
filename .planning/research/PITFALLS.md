# PITFALLS — Mikalyzed DMS Replacement

**Domain:** Used-car dealer management system (FL retail, single-dealer, solo-developer build replacing DealerCenter)
**Researched:** 2026-06-02
**Confidence overall:** MEDIUM — patterns derived from DMS / used-car retail / FL dealer practice and ESIGN/FCRA/GLBA bodies of law. **Session constraint:** no web verification was performed; specific FL statutes, HSMV form numbers, surtax caps, and provider SDK behaviors must be confirmed with the user's attorney/accountant before encoding into the system.

## How to read this document

Each pitfall lists:
- **What goes wrong** — the failure mode in concrete terms
- **Why it happens** — the structural reason (so the fix isn't cosmetic)
- **Warning signs** — what to watch for in logs, data, or workflow
- **Prevention** — actionable, DMS-specific, not "write tests"
- **Phase** — which roadmap phase should own the mitigation

Grouped by question domain (1–11). Within each group: **Critical → Moderate → Minor**.

---

## 1. Vehicle Identity Migrations (Phase 0)

Phase 0 unifies `Vehicle` (recon) and `InventoryVehicle` (DealerCenter mirror) into one canonical record. Live production app, real users, no rollback if it breaks. This is the single highest-risk migration in the project.

### CRITICAL — Opportunity attribution silently re-targets the wrong vehicle

**What goes wrong:** `Opportunity.vehicleId` today points at `Vehicle` (recon row). When you collapse onto one canonical record, if you make `InventoryVehicle` the canonical (per PROJECT.md Key Decisions), every existing `Opportunity.vehicleId` is pointing at the wrong table's PK space. A blanket "remap" by VIN can silently mis-attribute opportunities for units that share a VIN history (auction relist, repo, intra-dealer transfer), or units without a clean VIN match (typos, missing VINs). Sales attribution data corrupted; no signal at the type level — Prisma resolves a `vehicleId` that semantically belongs to a different vehicle.

**Why it happens:** Two tables were never linked. No canonical join key other than VIN (not enforced unique across history). No audit of historical typos or duplicates.

**Warning signs:**
- Pre-migration: any pair of rows with the same VIN across `Vehicle` and `InventoryVehicle` where created-at dates are months apart
- Post-migration: opportunities whose `vehicleId` resolves to a unit acquired *after* the opportunity's creation date
- Sales reps reporting "this opportunity is on the wrong car" after cutover
- Gross-by-rep numbers shifting unexpectedly vs. DealerCenter for the same date range

**Prevention:**
- Build a **mapping table** (`VehicleMigrationMap { oldVehicleId, oldInventoryVehicleId, canonicalId, matchMethod, matchConfidence, reviewedBy }`) before any FK change
- Match by **VIN + acquisition date proximity + price+cost match**, not VIN alone; manual review for low-confidence matches
- Preserve both old IDs as `legacy_vehicle_id` and `legacy_inventory_vehicle_id` on the canonical row — never drop them; this is the audit trail
- Snapshot `Opportunity.vehicleId` + computed VIN into a side table *before* the migration runs, so post-hoc reconciliation is possible
- Migrate in **read-only dry-run mode first**: write `canonicalId` to a new nullable column, ship a UI that displays both old and new attribution side-by-side, bake for one full week before flipping FKs

**Phase:** 0

### CRITICAL — Recon flow breaks because state lived on the recon Vehicle row

**What goes wrong:** Recon stage state, parts, checklists, photos[], and notification dispatch all reference `Vehicle.id` directly. If canonical becomes `InventoryVehicle.id`, every `VehicleStage.vehicleId`, `Part.vehicleId`, and notification handler needs to repoint. Miss one and that subsystem silently stops working (stage transitions don't fire, notifications go to wrong unit, mechanic board shows blanks). Users find out by losing a day of work.

**Why it happens:** Two-table parallel evolution. Recon built around `Vehicle`. Every recon-side feature assumes `Vehicle.id` is the universe.

**Warning signs:**
- Greppable FK pattern: any column ending in `vehicleId` not enumerated in the migration plan
- Lib files referencing `prisma.vehicle.findUnique` — every call site is a potential leak
- `lib/return-queue.ts`, `lib/stage-notifications.ts`, `lib/part-notifications.ts` (flagged in CONCERNS.md as fragile) — recon state machines with no tests
- Mechanic board, TV board, schedule pages showing wrong/missing vehicles after cutover

**Prevention:**
- Inventory every `vehicleId` foreign key in the schema and every `.vehicle.` Prisma call in the codebase **before** writing migration SQL
- **Reconsider: keep `Vehicle.id` as canonical PK and fold inventory fields into it** instead of repointing 20+ FK columns — the PROJECT.md decision to promote `InventoryVehicle` is correct on field-ownership grounds but doubles the migration surface (corroborates ARCHITECTURE.md Strategy A recommendation)
- Treat as schema operation + code-call-site sweep, not just SQL — no compiler check catches "you forgot to update this query"
- Hard-freeze recon UI for the cutover window (1–2 hours), drain in-flight stage transitions, then migrate, then re-enable

**Phase:** 0 — **gate** before any later phase

### CRITICAL — Stale cached UI state references vanished IDs

**What goes wrong:** Browser tabs open during cutover hold cached `vehicleId` values in component state, URL params, IndexedDB, service-worker caches, Capacitor WebView's persisted state on iOS. After migration those IDs no longer resolve. App shows white screens, 404s, or — worse — partial loads where URL says `/vehicle/123` but data is for a different car.

**Why it happens:** SPAs cache aggressively; Capacitor caches even more. No client-side invalidation when server PKs change underneath.

**Warning signs:**
- After cutover: "I clicked refresh and now it shows a different car"
- 404 spikes on `/api/vehicles/[id]` for IDs that *used* to exist
- Capacitor iOS users seeing stale data days later

**Prevention:**
- Make the canonical vehicle PK a **new UUID**, not a reused integer — so old IDs are obviously invalid (resolve to 404) instead of accidentally pointing at a different car
- Ship a **redirect endpoint**: `/api/vehicles/legacy/:oldId → 301 → /api/vehicles/:newId` using `VehicleMigrationMap`; keep alive for 90 days
- Force client-side cache bust on next page load post-cutover (bump a build-id cookie; if changed, hard-reload)
- Push a TestFlight build *before* cutover with the new ID resolution logic; iOS Capacitor users need a fresh binary

**Phase:** 0

### MODERATE — Orphan rows from rolled-back deals or canceled opportunities

**What goes wrong:** During migration, any vehicle row not currently associated with a recon stage, opportunity, or active inventory record may be silently dropped or marked "archived" — losing historical context (acquired, decided not to recon, sold wholesale). "What did we do with VIN X?" — answer is gone.

**Prevention:**
- Migrate **every row**, regardless of status — use `lifecycleStatus` enum (`active|sold|wholesaled|killed|archived`) to filter, never deletion
- Count rows before/after and reconcile to zero diff (excluding intentional dedupe merges, which must be logged)

**Phase:** 0

### MODERATE — Duplicate VINs across the two tables get merged when they shouldn't be

**What goes wrong:** A dealership sometimes acquires the same VIN twice (auction, then bought back, or returned consignment). If migration dedupes by VIN, the second acquisition's cost/price/timeline gets attached to the first acquisition's history. Profit attribution wrong forever.

**Prevention:**
- Dedupe key is `(VIN, acquisitionDate window ±30 days)`, not VIN alone
- When in doubt, **don't merge** — leave as two canonical rows with a `relatedVehicleIds` link; merging is destructive, splitting later is harder

**Phase:** 0

### MINOR — `Vehicle.photos[]` array column lost in the move to `MediaAsset`

**What goes wrong:** Existing `Vehicle.photos[]` array is replaced by typed `MediaAsset` records (per PROJECT.md). If migration doesn't seed `MediaAsset` from the array, photos disappear from UI even though files still exist in R2.

**Prevention:** Seed `MediaAsset` rows from `Vehicle.photos[]` during Phase 0, default `type = exterior` and `order = arrayIndex`. Keep `Vehicle.photos[]` column readable for 30 days as fallback.

**Phase:** 0 → 2

---

## 2. Deal Math — FL Retail Gross Profit (Phase 4)

FL tax computation is not just "rate × price." Doc fee, trade credit, surtax cap, and consignment commission interact in ways that bite. **Confidence:** LOW on specific rate/cap numbers — confirm with accountant; HIGH on the pattern of mistakes.

### CRITICAL — Doc fee taxable status hardcoded wrong

**What goes wrong:** FL generally treats dealer-charged "documentary service fee" / "predelivery service fee" as part of the taxable sales price (part of the consideration for the vehicle). If math computes tax on `vehiclePrice` only and adds doc fee post-tax, every retail deal under-collects tax — dealer eats the difference at next state audit. Reverse: double-tax it and overcharge customers.

**Prevention:**
- **Do not hardcode** the doc-fee-taxable boolean — make it a config (`config.flDocFeeTaxable: true`) with a comment citing the legal basis and the date accountant confirmed
- `taxableBase = vehiclePrice + (docFeeTaxable ? docFee : 0) + dealerAddOnsTaxable − tradeAllowance`; never short-circuit
- Show tax breakdown line-by-line on deal recap UI
- Run **shadow deals** for the first month: compute the deal in DMS and DealerCenter, alert on any delta > $1

**Phase:** 4

### CRITICAL — Trade-in tax credit applied incorrectly

**What goes wrong:** FL allows the trade-in **allowance** (not payoff) to reduce taxable base when the trade is part of the same transaction. Three common errors:
1. Using **payoff** instead of allowance (over-credits, under-taxes)
2. Applying credit when the trade is *not* part of the same titled transaction (customer sold their old car privately and brings cash — no credit allowed)
3. Allowing **negative net trade** (allowance < payoff) to *increase* the taxable base — negative-equity trade does not increase tax owed

**Prevention:**
- Schema clarity: `tradeAllowance`, `tradePayoff`, `tradeNetEquity` — never reuse a single "trade" number
- `tradeTaxCredit = max(0, tradeAllowance)` — clamp at zero
- UI: show "tax base = price + addons − trade credit (allowance)" so math is visible

**Phase:** 4

### CRITICAL — County surtax (discretionary sales surtax) cap missed on high-priced units

**What goes wrong:** FL counties levy a discretionary sales surtax on top of the 6% state rate, but historically the surtax applies only to the **first $5,000** of the taxable amount on a single tangible item (verify current cap with accountant). On a $30,000 vehicle, computing surtax on the full $30,000 overcharges significantly. Refunding requires re-titling.

**Prevention:**
- Two-step compute: `stateTax = base × 0.06`; `countySurtax = min(base, 5000) × countyRate`; total = sum
- Cap is config, not hardcoded — labeled with date the rule was confirmed
- Unit-of-tax = the vehicle, not the deal — each vehicle gets its own cap

**Phase:** 4 — confirm cap with accountant before encoding

### MODERATE — Lien payoff timing mismatch causes funded-but-unpaid trade

**What goes wrong:** Dealer takes trade Day 1, sells new car Day 1, but trade's lien payoff doesn't clear until Day 5–10 (check mailed to bank). If dealer's payoff figure was a 10-day quote that expired, actual payoff comes back higher (per-diem interest). Difference silently out of dealer gross unless system tracks it.

**Prevention:**
- Capture **payoff good-through date** as required field on every trade-in with a lien
- Compute and store per-diem rate; alert sales manager when payoff used >5 days after quote
- After actual payoff clears, store `actualPayoff` and computed `payoffVariance` on the deal; surface in gross-profit reporting
- QBO sync: payoff variance is a real journal entry — book it

**Phase:** 4 + 7

### MODERATE — Consignment commission edge cases

**Prevention:**
- Store the **commission contract** alongside the consignment vehicle: `commissionBase` enum (gross, net-of-fees, net-of-fees-and-recon), `commissionRate`, `commissionFloor`, `commissionCeiling`
- Compute consignor payout deterministically from those fields
- Voided deals reverse commission — wire commission booking to deal lifecycle, not deal creation

**Phase:** 4

### MODERATE — Holdback/pack confusion between true cost and gross-profit cost

**Prevention:**
- Schema: `acquisitionCost`, `costAdds[]`, `trueCost` (computed), `packAmount`, `bookedCost` (= trueCost + pack), separate display in UI
- Commission logic: explicitly choose which cost number compensation runs against — document the choice
- Reporting: show both numbers side-by-side

**Phase:** 4

### MINOR — Rounding accumulation in line-item tax

**Prevention:** Compute money in **integer cents** throughout; round once at the end, using consistent rounding rule — document which.

**Phase:** 4

---

## 3. Flooring / Floorplan (Phase 1 — Inventory Core)

### CRITICAL — Consignment units accidentally accrue flooring interest

**What goes wrong:** Consignment vehicles are not owned by the dealer and must never have flooring debt or interest. If inventory module applies flooring accrual by `lifecycleStatus = inventory` without checking `purchaseType`, every consignment unit accrues interest that's either booked as cost (reduces consignor payout — wrong) or never reconciled (accrual exists but no real debt — wrong).

**Prevention:**
- Schema: `purchaseType` enum (`purchased`, `consignment`, `trade-in`) is the master switch; flooring fields non-nullable only when `purchased`
- Accrual job: hard filter `WHERE purchaseType = 'purchased' AND flooringStatus = 'active'`
- Unit-test the filter with synthetic consignment units
- UI: don't render the flooring section on a consignment vehicle detail page

**Phase:** 1

### CRITICAL — Payoff-at-sale double-charges flooring

**Prevention:**
- Wrap deal closure + flooring payoff in a single database transaction
- `flooringStatus` enum with state machine: `pending → active → paid_off → reconciled`; payoff endpoint is idempotent (re-running on `paid_off` is a no-op)
- Accrual job filter: `WHERE flooringStatus = 'active'` — `paid_off` units don't accrue
- Reconciliation report: every `paid_off` unit should have exactly one matching payoff in QBO journal; alert on mismatches

**Phase:** 1 (accrual) + 4 (payoff at deal close) + 7 (QBO reconciliation)

### MODERATE — Curtailment payments missed

**Prevention:**
- Schema: `curtailmentSchedule` (array of `{daysHeld, percentDue}`) per floorplan lender
- Compute next curtailment due date on every accrual run; dashboard widget "Curtailments due this week"
- Vehicle detail page displays warning when approaching curtailment date (drives "discount and move it" decisions)

**Phase:** 1

### MODERATE — Per-diem rate change mid-period

**Prevention:**
- Store `flooringRateHistory` (array of `{effectiveDate, rate}`) per lender
- Accrual = sum over days in period using rate in effect each day
- Monthly reconciliation against lender statement; alert on >$5 variance

**Phase:** 1

### MINOR — Accrual job timezone confusion

**Prevention:** Store lender's billing timezone; compute day count in that timezone; document it.

**Phase:** 1

---

## 4. E-Signature (Phase 5 — Documents + ESIGN)

PROJECT.md correctly chose to **integrate** BoldSign or Anvil for cryptographic seal + trusted timestamp. Pitfalls below are the wrapping — consent capture, audit trail, what gets signed.

### CRITICAL — Missing ESIGN consent step renders the entire signed packet challengeable

**What goes wrong:** ESIGN requires affirmative consent to use electronic signatures *before* the signing flow begins. If customer never sees and clicks "I consent to sign electronically," the signed PDF is technically challengeable in court. Providers include a consent step, but if you embed their iframe in a way that skips or pre-fills the consent click, you've defeated the protection.

**Prevention:**
- Use the provider's **out-of-the-box consent screen** — don't customize away
- Verify the audit certificate after signing has a "Consumer Consent" entry with a timestamp distinct from the signature timestamp
- Legal review of consent language *and* the consent UX flow before go-live
- Don't pre-fill or auto-click the consent in any code path

**Phase:** 5

### CRITICAL — Audit trail gaps in the embedded signing wrapper

**What goes wrong:** BoldSign/Anvil produce per-document audit certificates (who signed, when, IP). If your wrapper logic does anything between "customer clicks I'm done" and "PDF is sealed" — re-merges a PDF, swaps a field value, runs prefill again — the audit certificate doesn't cover that mutation. A signed packet diverging from what the provider sealed is unusable in dispute.

**Prevention:**
- Treat the prefilled PDF as **immutable** the moment it's handed to the e-sign provider — store its SHA-256 hash before sending
- After signing, fetch the signed PDF + audit certificate; verify the signed PDF's "before-signature" hash matches what you sent
- Never re-render or re-prefill mid-signing flow; if a field needs to change, void the session and start fresh
- Store the audit certificate as permanent part of the `Document` record — never delete, never overwrite

**Phase:** 5

### CRITICAL — Server-side timestamps treated as trusted timestamps

**Prevention:**
- Always display signing time **from the provider's audit certificate**, not from a self-generated timestamp
- If storing a "received" timestamp locally for sorting/reporting, name it `webhookReceivedAt`, not `signedAt`
- The legally-meaningful `signedAt` field is populated only from the audit certificate

**Phase:** 5

### MODERATE — Attribution failure: signer identity not verified

**Prevention:**
- KBA (knowledge-based authentication) configurable per document type; default ON for retail purchase agreements and odometer disclosures over a threshold
- Audit certificate includes KBA result — store it

**Phase:** 5

### MODERATE — Voided/canceled deals leave orphaned signed documents

**Prevention:**
- `Document.status` enum: `draft|sent|signed|voided|superseded`
- When a deal voids, mark all attached signed documents `voided` with timestamp and reason
- Cover-page or watermark for voided docs when displayed ("VOIDED — see deal #1234")
- Never delete the signed PDF; voiding is a status change, not destruction

**Phase:** 5 + 4

---

## 5. Credit Pulls (Phase 6 — Credit Applications)

PROJECT.md correctly chose to **integrate** 700Credit or eLEND, absorbing most FCRA/GLBA/Red Flags liability. Pitfalls are the wrapping — what data you handle, what you log, what UX gates the pull.

### CRITICAL — Pulling credit without documented permissible purpose

**What goes wrong:** FCRA §604 requires a **permissible purpose** (typically: written consent from the consumer for a credit transaction they initiated). If a sales rep pulls credit on a walk-in before customer signed consent and indicated intent to transact, that's an FCRA violation per pull. Bureau penalties + civil liability + reseller can terminate the dealer.

**Prevention:**
- Pull endpoint **requires** a `creditApplicationId` whose status is `consentSigned`; without it, returns 403
- Consent capture is its own signed document (Phase 5 e-sign), with audit trail
- Activity log: every credit pull writes a `creditPull.executed` log entry with actor, target contact, linked consent document ID, timestamp, permissible-purpose code sent to bureau
- UI: "Pull Credit" button disabled with explanation until consent is on file
- Quarterly audit: random sample 10% of pulls, verify each has a signed consent dated *before* the pull

**Phase:** 6

### CRITICAL — Soft-pull / hard-pull boundary blurred

**Prevention:**
- `CreditPull.type` enum: `soft_prequal | hard_underwriting` — required
- Two separate consent document templates, each scoped to their pull type
- Provider API call constructs the request from `CreditPull.type` — no defaulting
- Test plan: pull on a known synthetic profile, verify bureau inquiry record shows expected type

**Phase:** 6

### CRITICAL — SSN / DOB persisted locally despite "provider holds NPI" architecture

**What goes wrong:** PROJECT.md commits to "no raw SSN/DOB stored locally — provider holds NPI." This is the GLBA Safeguards posture. But: where does the SSN live during the application form before submission?
- Browser memory (fine, ephemeral)
- Next.js API route (server memory, request log if not careful)
- Vercel function logs may capture request body
- Form recovery / "save draft" may persist it
- Browser autofill may save it
- Sentry/APM (if added later) may capture in error stack traces

Any of these is a GLBA breach the moment it happens.

**Prevention:**
- Credit app form **submits directly to the provider's iframe or API endpoint**, not through your Next.js server — if SSN never traverses your infrastructure, you can't leak it
- If a provider iframe isn't available, post directly to the provider's API from the *client*, with the dealer's API key returned just-in-time from a short-lived signed endpoint
- Server-side log scrubbing rules: never log request bodies on `/api/credit-*` endpoints; log only structural metadata
- Explicitly **disable** autofill on SSN fields; consider a custom masked input
- No "save draft" on credit application forms
- Audit on every Phase 6 PR: search the diff for `ssn`, `dob`, `dateOfBirth` and verify no persistence

**Phase:** 6 — architect this *before* writing any credit code

### CRITICAL — Viewing credit records without audit trail

**Prevention:**
- Every fetch of `CreditPull` or `CreditApplication` writes a `CreditAccessLog` entry (separate table from ActivityLog per ARCHITECTURE.md): `actorId`, `accessType`, `ipAddress`, timestamp
- This includes API endpoints and UI page renders — both log
- Quarterly RBAC review: who has the `viewCredit` permission? Did they each actually need to view a credit in the last 90 days?
- Aggressive session timeout on credit pages (15–30 minutes, not 7 days)

**Phase:** 6

### CRITICAL — Adverse action notice delivery failures

**What goes wrong:** FCRA / ECOA require an adverse action notice (the "denial letter") when credit is denied, sent within specific timelines (5 business days for ECOA, 30 days for FCRA generally — **confirm with attorney**). If the lender denies and dealer doesn't deliver, consumer can sue. If dealer relies on lender to send, you still need to verify it went out.

**Prevention:**
- `CreditPull.outcome` enum includes `denied`; whenever a pull resolves to denied, system creates a pending `AdverseActionNotice` task
- Confirm with provider which party sends notice for each lender; document per-lender
- If dealer sends: integrate template, deliver via email + mail with delivery confirmation, store artifact in `Document`
- If lender sends: provider webhook should confirm delivery; surface unconfirmed deliveries as overdue tasks
- Time-to-delivery SLA monitor: any adverse action pending > 4 business days alerts

**Phase:** 6 — verify exact timelines with attorney

### MODERATE — Red Flags Rule (identity theft prevention) requirements unaddressed

**Prevention:**
- Providers typically include OFAC + Red Flags checks; surface their results in the DMS deal screen
- Don't auto-suppress a hit — require explicit user review and a logged decision ("resolved as not a match, reason: …")
- Activity log captures the review

**Phase:** 6

### MINOR — Reusing a credit pull across multiple deals

**Prevention:**
- `CreditPull.permittedDealIds[]` — explicit allowlist
- UI: if stale pull selected for new deal, warn and require manager override + activity log

**Phase:** 6

---

## 6. QuickBooks Online Sync (Phase 7)

### CRITICAL — Rounding errors that aggregate over the month

**Prevention:**
- Compute every dollar in **integer cents**
- For each deal, sum of journal lines posted to QBO must equal the deal's total to the cent — assert this before sending; reject the sync if not
- Reconciliation report: total revenue this month per DMS vs. per QBO; alert on any variance

**Phase:** 7

### CRITICAL — Tax payable misallocation across state vs. county

**Prevention:**
- DMS computes `stateTax` and `countySurtax` separately (see deal-math pitfalls) and posts to two separate liability accounts in QBO
- Account mapping is configuration, not hardcoded — accountant supplies QBO account IDs

**Phase:** 4 (compute split) + 7 (sync split)

### CRITICAL — Voided / unwound deals not reversed in QBO

**Prevention:**
- `Deal.status` enum includes `voided|unwound|charged_back`; each triggers reversing entries
- Reversing entries reference the original by ID, never delete the original — auditors need the trail
- Monthly reconciliation: every DMS deal in `voided` status has matching reversal in QBO

**Phase:** 7

### MODERATE — Deferred revenue / commission timing

**Prevention:**
- `Commission.status`: `accrued|payable|paid|reversed`
- Commission moves to `payable` only when deal is fully funded and past return window
- Reversal entry if deal unwinds after commission paid

**Phase:** 7

### MODERATE — Cost adds posted to wrong period

**Prevention:**
- Cost adds initially post to a **Work-In-Process** account (asset, not COGS)
- When deal closes, the deal's COGS line *transfers* the WIP balance for that vehicle to COGS — period-matched with revenue
- Open WIP balance per vehicle is a reportable number; alert if WIP exists for sold vehicles or for units > 90 days old

**Phase:** 7

### MINOR — Provider API rate limits / token refresh

**Prevention:** Exponential backoff on 429; token refresh in a try/catch with auto-retry; alert if sync hasn't run successfully in > 6 hours.

**Phase:** 7

---

## 7. Document Generation (Phase 5)

### CRITICAL — Tax/fee values on signed PDF diverge from deal in DB

**What goes wrong:** Deal has tax = $1,234.56 in DMS. PDF generated and signed. Later, deal recap UI shows tax = $1,234.50 (six cents different due to a fix or re-compute). Signed PDF inconsistent with system of record. In dispute, the signed PDF wins legally — but the dealer's books say something else.

**Prevention:**
- **Snapshot the deal at signing**: `DealSnapshot { dealId, fieldsJson, signedAt }` — every field used in the PDF is frozen at sign-time
- After signing, deal recap UI reads from the snapshot, not from recomputed live values
- Current-live deal values can still update for in-progress edits, but the signed snapshot is the legal record
- If a deal must be amended post-signing, that's a new signing session and a new snapshot — never edit a signed snapshot

**Phase:** 5

### CRITICAL — Required FL forms missing from the signed packet

**Prevention:**
- Maintain a `RequiredFormSet` per deal type (retail-cash, retail-financed, wholesale, consignment-disposition, trade-in-acquisition)
- "Send for Signature" button is **disabled** until every required form for the deal type is generated and in the packet
- Each form has a `templateVersion`; snapshot records the template version that signed
- Cross-check against DealerCenter packet during parallel-run period: every form in DealerCenter must be in DMS

**Phase:** 5 — confirm complete form list with attorney before encoding

### CRITICAL — Template drift between draft and signed version

**Prevention:**
- When a draft PDF is generated, record `templateVersion` used
- "Send for Signature" uses the **same template version** as the draft was generated with, not "latest"
- If template version has changed since draft, force a re-draft and explicit re-review by the rep (banner UI)
- Template versions are immutable; updates create v2, never modify v1

**Phase:** 5

### MODERATE — Vehicle data fields stale on the signed form

**Prevention:**
- Same snapshot pattern as deal math: freeze vehicle fields used in PDF at sign-time
- For odometer specifically: lock value as part of "Send for Signature"; subsequent changes require manager override + activity log + re-sign

**Phase:** 5

### MODERATE — Buyers Guide mismatched with vehicle condition

**Prevention:**
- Field-level required: deal must specify warranty status before Buyers Guide is generated
- If marked "AS IS," validate that no warranty product is sold on the same deal

**Phase:** 5

### MINOR — Customer name / address typos copy-paste into every form

**Prevention:** Same snapshot pattern; signed name/address is legally authoritative once signed; later contact-record updates don't propagate retroactively.

**Phase:** 5

---

## 8. Solo-Developer Specific Risks

### CRITICAL — Over-scoping a phase such that nothing ships for 2+ months

**Prevention:**
- **Sub-phase shipping**: every phase has 3–5 sub-deliverables, each ships to production within 1–2 weeks
- Feature-flag everything new; flag is OFF in production until sub-phase is done; partial work doesn't block
- If a sub-phase hits week 3 without shipping, **stop and cut scope**
- Phase 0 (vehicle unification) is the exception — it cannot ship partially; allocate extra calendar time and resist scope additions

**Phase:** All

### CRITICAL — Compliance review skipped to ship faster

**Prevention:**
- Treat attorney review as **hard gate** in phase plan, with dates booked *before* dev starts
- Don't enable the feature flag in production until legal sign-off is documented in the planning folder
- Specific touch points: ESIGN consent language, FCRA permissible-purpose flow, GLBA privacy notice, FL doc-fee disclosure, Buyers Guide language, adverse-action template
- Schedule the review as a milestone deliverable — get a written email confirming review

**Phase:** 5, 6

### CRITICAL — No staging environment for FCRA/GLBA testing

**Prevention:**
- Vercel preview deployments use **separate Postgres** (Supabase project) for any work touching credit, deals, documents — set up *before* Phase 4
- Provider sandboxes (700Credit test mode, BoldSign sandbox, QBO sandbox company) — request and configure at start of relevant phase
- Synthetic test customers with synthetic SSNs (provider-supplied test data) — never test with real customer data outside production
- Environment-aware code: any credit/document/deal endpoint refuses to run in non-prod with production data

**Phase:** Before Phase 4

### MODERATE — Integration provider churn

**Prevention:**
- Define provider-agnostic **interfaces** in `lib/integrations/<domain>/` — `CreditBureau`, `ESignProvider`, `VinDecoder`, `Accounting` — with provider-specific implementations
- Never let provider-specific fields leak into DB schema (don't have `boldsign_document_id` as a column — have `external_document_id` + `provider` enum)
- Test the interface boundary by writing a no-op mock implementation; if anything in the app code references the concrete provider, it's a leak
- Annual review: which providers are stable, which are at risk?

**Phase:** All integrations (5, 6, 7)

### MODERATE — Premature abstraction (the opposite of the above)

**Prevention:**
- Rule of three: don't extract an interface until two concrete implementations exist or are imminent
- Phase 5 / 6 / 7 each integrate **one provider first**; refactor to an interface only when adding a second (or migrating)
- Exception: hard-isolate provider-specific PII (SSN handling) immediately — that's a security boundary, not an abstraction-quality decision

**Phase:** All

### MODERATE — Single developer = single point of failure

**Prevention:**
- **Runbook** for the user-as-operator: how to roll back a deploy, read Vercel logs, disable a feature flag, manually update a record, who to call for compliance breaks
- Critical credentials in shared password manager with trusted backup contact
- Document recurring failure modes as they happen (incident log in `.planning/incidents/`)
- Schedule deploys for early-week to leave room for fix time

**Phase:** Continuous

### MINOR — No code review = silent bad patterns

**Prevention:**
- Self-review PRs by walking the diff after a 24-hour break (literally not the same day)
- Periodic "anti-pattern sweeps" — a half-day each phase to grep for `.catch(() => {})`, files > 1000 lines, etc.
- Use Claude as a code-review pair where appropriate

**Phase:** Continuous

---

## 9. Migration & Go-Live Risks

### CRITICAL — Dual-entry too long causes data drift

**Prevention:**
- **Hard cap dual-entry period at 2 weeks**, ideally 1 week
- Before cutover: daily reconciliation report must show < 5% delta between systems for 5 consecutive business days
- Cutover is a **decision date** announced in advance; after that date, DealerCenter is read-only (no new deals)
- DealerCenter stays read-only for 90 days for historical lookups, then archived

**Phase:** Pre-Phase-8 / cutover milestone

### CRITICAL — Cutover timing strands mid-deal customers

**Prevention:**
- Cutover criteria includes "no open deals more than 3 business days old in DealerCenter"
- For deals open at cutover: complete in DealerCenter; do **not** migrate mid-deal
- New deals start in DMS after cutover date — even for customers whose data was previously in DealerCenter
- Title/funding workflow has explicit "started in DealerCenter, complete in DealerCenter" pathway for 60 days post-cutover

**Phase:** Pre-Phase-8 / cutover milestone

### CRITICAL — No rollback strategy if Phase 0 breaks recon

**Prevention:**
- **Read-only dry-run window**: ship migration code with `canonicalId` column populated but FKs not yet repointed; run for a week; verify
- Database snapshot immediately before FK flip; tested restore procedure
- Feature flag: application reads from old or new IDs based on config; flipping is a 1-line config change, not a deploy
- Practice the rollback on a copy of production data before cutover
- Cutover during a low-activity window (end of day, weekend)

**Phase:** 0

### MODERATE — Capacitor iOS users on old builds after cutover

**Prevention:**
- Backend `/api/vehicles/legacy/:oldId` redirect endpoint
- Min-version check: app on launch hits `/api/version-check` and forces user to update if below cutover-version
- Push a build with new code *before* cutover; new code must still work against pre-cutover backend (feature-flagged)

**Phase:** 0

### MODERATE — Reporting baseline lost after cutover

**Prevention:**
- Phase 8 includes a **read-only historical import** of DealerCenter deals for the prior 24 months
- Imported deals are marked `source = dealercenter_import` and don't trigger workflow side effects (no commissions accrued, no notifications)
- Reports include or exclude imported records via a filter

**Phase:** 8

---

## 10. Vendor Lock-In Analysis

### Lock-in Severity Matrix

| Provider | Lock-in Severity | Why | Mitigation |
|----------|------------------|-----|------------|
| **700Credit / eLEND** (credit) | HIGH | FCRA reseller credentialing is dealer-specific; SSN/DOB flow tightly coupled to provider iframe/API; lender connections curated per reseller | Strict `CreditBureau` interface; store **decision outcomes** in your own schema with provider-agnostic fields; never store provider-specific consent doc IDs as primary keys |
| **BoldSign / Anvil** (e-sign) | MEDIUM | Audit certificates are provider-specific format; webhook event shapes differ; embedded iframe SDKs differ | `ESignProvider` interface with `sendForSignature`, `getAuditCertificate`, `voidSession`; store the signed PDF + cert *bytes* (provider-agnostic), not provider references; PDF generation (prefill) is in-house so portable |
| **QuickBooks Online** (accounting) | HIGH | Account IDs, vendor IDs, customer IDs in QBO are referenced from your sync layer; switching to Xero / Wave means rebuilding the mapping + replaying history | Store a **canonical journal** in your own DB; QBO sync is a downstream projection; if you swap accounting, re-project from canonical journal |
| **VIN decoder (DataOne / Chrome Data)** | LOW | Decoded data is just data — VIN + JSON; trivially replayable | Cache decoded results indefinitely; if you swap providers, only new VINs hit the new one |
| **Twilio** (existing) | MEDIUM | Phone number portability is real but slow; webhook URLs and message-format coupled | Existing; lock-in already accepted |
| **Microsoft Graph** (existing) | LOW | Email is email; switching to direct SMTP/IMAP per user is doable | Existing |

### CRITICAL — QBO account IDs hardcoded across the codebase

**Prevention:**
- All account IDs live in **one configuration table** (`AccountingMapping`) with semantic keys (`sales_tax_state_payable`, `cogs_used_vehicles`, etc.) → provider-specific IDs
- All sync code references semantic keys, never raw IDs
- When swapping providers, the mapping table is the only thing to update

**Phase:** 7

### CRITICAL — Credit provider's customer ID treated as your customer ID

**Prevention:**
- Your `Contact.id` is the source of truth; provider IDs stored as `CreditApplication.externalReference` (per pull/per app) with a `provider` enum
- Never lookup a contact by a provider ID — always by your own ID

**Phase:** 6

### MODERATE — E-sign provider-specific field metadata bleeds into templates

**Prevention:**
- Author templates with **PDF form fields** in a provider-agnostic PDF editor; the e-sign provider attaches signature/date fields *programmatically at send time* via the SDK
- DMS knows where each field goes (config); provider just renders
- Switching providers = swap the SDK call, templates unchanged

**Phase:** 5

---

## 11. Florida-Specific Pitfalls

**Confidence:** LOW on specific rates/cap numbers — confirm with accountant; MEDIUM on structural rules.

### CRITICAL — Sourcing rule (which county's surtax applies) wrong

**What goes wrong:** FL discretionary sales surtax for motor vehicles is historically sourced based on **county where vehicle will be registered** (purchaser's county of residence), not the dealer's county or sale location. Using dealer's county overcharges or undercharges, and FL DOR audit flags it.

**Prevention:**
- Required field on every retail deal: `purchaserCountyForTax` (defaults to purchaser's address county, can be overridden with reason)
- Surtax rate looked up from a `FLCountySurtaxRate` table keyed by county; maintained based on FL DOR publications
- Deal jacket prints the county used and the rate applied
- **Confirm rule with attorney/accountant** — sourcing rules occasionally change

**Phase:** 4

### CRITICAL — Doc fee disclosure language missing or wrong

**Prevention:**
- Doc fee line is its own line item on the deal jacket, buyers order, purchase agreement — never folded into "fees"
- Disclosure language is in the template (reviewed by attorney)
- A "doc fee disclosure acknowledged" checkbox/initial on the purchase agreement

**Phase:** 5

### CRITICAL — HSMV form errors block title transfer

**Prevention:**
- Field-level validation on every HSMV-bound field (VIN format, odometer required and within plausible range, lien info present if floored)
- Pre-flight check before "Send for Signature": every required HSMV field on every required form is non-null
- Test "dummy packet" reviewed by user/title clerk monthly to catch form drift

**Phase:** 5 — **confirm exact current form numbers and required fields with attorney/title clerk**

### MODERATE — Dealer recordkeeping requirements unaddressed

**Prevention:**
- Signed documents are **immutable** — no edit, no delete; corrections happen via voiding + re-issuing
- Soft-delete is fine for in-progress data; **forbidden** for any signed document, credit pull, or closed deal
- Retention enforced at storage layer (R2 lifecycle policy: retain for legally required period; default 5 years for FL pending verification)
- Quick "audit packet export" function: given a date range, dump all deals + signed documents + activity logs as a zip

**Phase:** 5, 6, ongoing

### MODERATE — Tax-exempt buyers handled wrong

**Prevention:**
- `TaxExemption` enum with required supporting-document attachment
- If exemption is `resale`, dealer-license certificate required
- If exemption is `out_of_state_delivery`, delivery affidavit + out-of-state title work required
- No "exempt" without docs; activity log captures who granted

**Phase:** 4

### MODERATE — Tag and title fees vs. taxable base confusion

**Prevention:**
- Separate fee classes: `dealerFee` (taxable), `governmentFee` (pass-through, non-taxable), `dealerAddOn` (taxable, optional)
- Tax base computation uses only `dealerFee` + `dealerAddOn` + vehicle price; never `governmentFee`
- UI distinguishes them clearly

**Phase:** 4

### MINOR — Surtax rate changes annually

**Prevention:** `FLCountySurtaxRate` table includes `effectiveDate`; rate used for a deal is the one effective on the deal date. Annual calendar reminder to verify rates from FL DOR publications.

**Phase:** 4 + ongoing

---

## Phase-Specific Warning Summary

| Phase | Most Critical Pitfalls to Address |
|-------|-----------------------------------|
| **0 — Vehicle Unification** | Opportunity attribution drift, recon flow break, stale UI state, dry-run + rollback plan, mapping table preserved as audit trail |
| **1 — RBAC + Jobs scaffold + Inventory Core** | Consignment floored, payoff double-charge, curtailment misses, rate-history accuracy, GLBA permission keys defined |
| **2 — Inventory deepening + Media System** | `Vehicle.photos[]` migration into `MediaAsset`; orphaned files in R2 |
| **3 — Customer / Marketing** | Lead→customer promotion preserves contact history; channel syndication doesn't leak unpriced/un-photographed units |
| **4 — Deal Desk** | Doc-fee taxable rule, trade-in tax credit, surtax cap, payoff variance, consignment commission, pack/cost confusion, FL sourcing rule, tag/title pass-through |
| **5 — Documents + E-Sign** | ESIGN consent, audit certificate integrity, server timestamps ≠ trusted timestamps, template version drift, required FL forms complete, snapshot the deal at signing, HSMV field validation |
| **6 — Credit** | Permissible purpose enforced, soft/hard pull boundary, SSN never persisted server-side, view-audit logging, adverse action delivery, Red Flags surfacing |
| **7 — QBO** | Integer-cent precision, state vs. county tax allocation, void/unwound reversal, WIP→COGS period match, semantic account mapping |
| **8 — Reporting + Rollout** | Dual-entry capped, historical import, no mid-deal cutover, rollback rehearsed, runbook in place |

---

## What I Couldn't Verify in This Session

Per the session constraint, the following claims are **LOW confidence** and require external verification before encoding:

- **Exact FL discretionary surtax cap** (historical $5,000 — confirm current)
- **Exact FL doc-fee taxable status** (general practice is taxable — confirm with FL DOR / accountant)
- **Exact HSMV form numbers** (HSMV 82040 historically — confirm current set)
- **Adverse action delivery timelines** (ECOA / FCRA — confirm with attorney)
- **FL dealer recordkeeping retention period** (default to 5 years pending verification)
- **Whether QBO has changed its rate-limit / OAuth posture** (confirm at Phase 7 start)
- **Current state of FL surtax sourcing rule for motor vehicles** (purchaser's county of residence — confirm)
- **Whether 700Credit vs. eLEND have changed pricing / API posture** (confirm at Phase 6 start)

All structural pitfalls (consent flow, audit integrity, mapping tables, snapshot patterns, integer-cent math, dual-entry caps) are HIGH/MEDIUM confidence — they're patterns, not specific facts.
