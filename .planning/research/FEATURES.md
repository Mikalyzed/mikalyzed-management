# Feature Landscape — Mikalyzed DMS

**Domain:** DMS for a single-store independent used-car dealer in Florida
**Researched:** 2026-06-02
**Mode:** Project research — features dimension (DMS subsequent milestone; CRM/recon/messaging out of scope)
**Confidence:** MEDIUM overall — concepts HIGH; FL-specific rates, vendor pricing, and current form numbers LOW (web tools blocked this session; user to verify)

## Reading Guide

Three categories, all DMS-specific:
1. **Table Stakes** — without these, dealers won't replace DealerCenter.
2. **Differentiators** — where a custom in-house DMS beats DealerCenter; this is where the project earns its keep.
3. **Anti-Features** — things DealerCenter ships that this user should NOT replicate, plus features that look attractive but are traps.

Complexity scale: **Low** (≤1 wk solo), **Med** (1–3 wks solo), **High** (>3 wks or compliance-gated).

---

## 1. INVENTORY

### Table Stakes

| Feature | Why Expected | Complexity | FL? | Notes |
|---|---|---|---|---|
| Canonical vehicle record (VIN, stock #, YMM/trim, miles, color, body, drivetrain, fuel) | Single source of truth | Med | No | Already Phase 0 in PROJECT.md |
| VIN decode at intake | Manual trim entry is #1 source of bad inventory data | Low | No | vPIC free (year/make/model/body/engine); DataOne or Chrome Data paid for trim/options. LOW confidence on current pricing |
| Acquisition source classification | Drives gross-by-source reporting | Low | No | Auction (lane + sale date), trade-in, street purchase, wholesaler, consignment |
| Cost build-up: purchase + auction fees + transport + recon + pack | "True cost" = denominator of every gross calc | Med | No | `CostAdd` already in PROJECT.md. Recon vs pack must be separated — see Differentiators |
| Title status tracking | Cannot retail without title-in-hand under FL law | Low | **Yes** | States: ordered / in transit / in hand / lien held / branded / lost (HSMV 82101 duplicate) |
| Aging buckets (0-30 / 31-60 / 61-90 / 90+) | Industry-standard managerial triage | Low | No | Days from acquisition date, NOT publish date — common error |
| Status: in-recon / front-line / available / pending / sold / wholesale / unwound | Gates marketing syndication + deal desk | Low | No | Reconcile with existing stage system |
| Flooring/aging exposure dashboard | Solo operator needs one-glance "what's costing me" | Med | No | See Flooring |
| Hold / "do not sell" flag | Recalls, title pending, etc. | Low | No | One nullable text + reason enum |
| Reserve / "promised" hold | Lock unit during active deal | Low | No | Locks marketing syndication |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Itemized cost adds with attached receipts + actor** | DealerCenter has a flat "recon cost" you type in. Receipts + uploader + activity log = audit-grade cost basis | Med | `CostAdd { vehicleId, kind, amount, vendorId?, receiptUrl?, addedById, addedAt }` |
| **Recon / flooring / pack visible separately on every unit** | Dealers can't normally answer "did I lose because recon ran over or because it sat too long?" | Med | Three buckets roll into true cost; all visible |
| **Source-pack costs tied to acquisition event** | Auction "all-in" often differs 5–10% from typed price | Low | Sub-type of CostAdd: `kind = "acquisition_fee"` |
| **Real-time daily cost view** ("this car has cost $X as of today incl $Y flooring accrual") | Hard to compute in DealerCenter without exporting | Low | Computed, not stored. Drives age-aware pricing |
| **Activity log surfaced on vehicle page** | Every cost/photo/message/status in one timeline | Low | Wire vehicle detail page to read `ActivityLog` |
| **AI-suggested pricing band** based on age + comps | DealerCenter pricing is "type a number" | Med | Needs market comp source (MMR/Black Book/vAuto, paid) — LOW confidence on viability without paid data |
| **"Stale media" flag** (front-line N+ days, no new content) | Drives content team without separate request system | Low | Computed from media timestamps vs front-line-ready date |
| **Inventory-to-marketing sync status visible per vehicle** | Where is this listed right now? | Med | Real workflow improvement even if push-only |
| **Holdback tracking** | Mostly N/A for true independents | Low | LOW confidence on whether this applies to Mikalyzed's mix — skip unless asked |

### Anti-Features

| Anti-Feature | Why Avoid | Instead |
|---|---|---|
| **Built-in MMR/Kelley pricing module** | Requires paid data feed (~$200–500/mo, LOW confidence). Most independents do this in a browser tab | Defer to Phase 10+ as paid integration |
| **Multi-location inventory transfer workflow** | Leaks scope toward multi-tenant; PROJECT.md is single-store | Skip |
| **Buyer's order builder inside inventory module** | Belongs in Deal Desk; don't duplicate | Build once in Deal Desk |
| **"Marketing description" rich-text editor on vehicle** | Already exists via `generate-ad` + Content stage | Use existing |
| **Free-text vehicle "options"** | Auction data is structured; free-text becomes report garbage | Structured options from VIN decode + closed-vocab highlights tags |

---

## 2. FLOORING / FLOORPLAN

### Table Stakes

| Feature | Why | Complexity | Notes |
|---|---|---|---|
| Per-vehicle flooring record (provider, advance, advance date, curtailment schedule, payoff terms) | Required to compute true cost | Med | Skip for consignment + cash-bought. Providers (training data, LOW conf on current state): NextGear Capital, Floorplan Xpress, AFC, Westlake Floorplan |
| Daily interest accrual | Flooring is daily, not monthly | Low | principal × daily rate × days. Configurable per line, not hardcoded |
| Curtailment events | Lenders require paydowns at 30/60/90; missing one = penalty | Med | Schedule = array of (dueDate, amountDue, paidDate, paidAmount). Notification at T-7 days |
| Payoff at sale | When deal funds, line gets paid — hits QBO | Med | Triggered from Deal funding |
| Flooring exposure dashboard | "What do I owe lenders right now across all units?" | Low | Sum outstanding principal + accrued interest |
| Per-line rate config | Different lenders, different terms | Low | Settings table, not hardcoded |

### Differentiators

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| **Flooring-aware aging** combining days + daily flooring cost into "cost-to-keep-per-day" | Turns aging from vanity number into money number | Low | Multiplication; surface on vehicle card |
| **Auto-payoff-quote at deal time** | Deal desk knows exact payoff at funding date — no NextGear call | Med | Computed from flooring + funding date |
| **Curtailment reminders via existing notifications/tasks** | Missed curtailment = penalty | Low | Free with existing notification system |
| **"Was-floored vs cash" margin tagging on every funded deal** | Measure whether floored inventory is actually profitable after carry | Med | Tag on deal + carry cost; surface in gross reports |

### Anti-Features

| Anti-Feature | Why | Instead |
|---|---|---|
| **Direct API integration with NextGear / AFC / Floorplan Xpress** | Most are partner-gated or non-existent for independents | Manual entry of advance + curtailments. CSV import later. LOW conf on 2026 API availability |
| **Multi-lender flooring "optimization"** | Over-engineered for solo, 1–2 lenders | Skip |
| **In-app "request advance" flow** | Lenders own that UX in their portals | Link out |

---

## 3. DEAL DESK (cash + outside financing only)

### Table Stakes

| Feature | Why | Complexity | FL? | Notes |
|---|---|---|---|---|
| Deal record (Contact + Vehicle + trade-ins) | Central transaction object | Med | No | PROJECT.md Phase 4 |
| Buyer's order PDF | Required, summarizes the math | Med | No | pdf-lib prefill |
| Sale price + agreed-on-paper math | Negotiated, not list | Low | No | |
| Trade-in workflow: allowance vs ACV | Allowance ≠ ACV; over-allowance = price concession | Med | No | Both numbers needed for accounting |
| Trade payoff with 10-day quote | If trade has a lien, need 10-day payoff to cut lender a check | Med | No | Manual entry of payoff + good-through date is fine |
| Dealer doc fee | Must be disclosed + consistent | Low | **Yes** | Configurable per dealer; disclosure language required |
| Electronic title fee | ETR processing fee | Low | **Yes** | LOW conf on current amount (~$25 historically) |
| Tag/title + registration | New tag vs transfer changes amount; varies by county | Low | **Yes** | Per-county lookup; user-confirmed |
| FL sales tax + county surtax | 6% state + county surtax (cap on motor vehicles — LOW conf on current cap) | Med | **Yes** | Tax basis = sale price minus trade allowance (FL trade-in credit) |
| Tire fee + battery fee | LOW conf whether they apply to used retail; user/accountant verifies | Low | **Yes** | Configurable; default off; document source |
| GAP product (optional third-party) | Cost vs retail tracked | Low | No | Difference = F&I gross |
| Service contract / VSC (optional third-party) | Same structure as GAP | Low | No | F&I gross |
| Gross profit calc: front + back gross | Front = price − true cost − over-allowance; back = F&I product profit | Med | No | Most important number in the system |
| Out-the-door price | What the customer pays — sum of all lines | Low | No | |
| Deposit handling | Refundable vs non-refundable; tied to deposit agreement | Low | No | |
| Deal status lifecycle | Working → finalized → funded → delivered → unwound | Low | No | Funded ≠ delivered |
| Funding source tracking (cash vs outside lender check) | Determines whether deal is fundable today | Low | No | Lender name, check expected, check received |
| Wholesale disposition deals | Dealer-to-dealer; no tax, different docs | Med | No | Retail vs wholesale flag on deal |
| Consignment intake → consignment sale | Owned by third party; commission % | Med | No | Funding goes mostly to consignor |
| Deal unwind workflow | Deals fall through after delivery — reverse cleanly | Med | No | Reverses inventory + accounting + logs reason. Don't underestimate |

### Differentiators

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| **Live deal-math worksheet** — every variable updates OTD in real time | DealerCenter's deal screen is form-and-recalc | Med | Single-page reactive component, server-validated on save |
| **One-click "what's my gross at this price?"** | Sales floor negotiation aid | Low | Computed in-progress |
| **Deal-to-flooring-payoff link visible in worksheet** | Sales sees "we need $X to clear flooring" | Low | From flooring record |
| **Auto-generated 3-square (price/trade/down)** for negotiation | F&I/desk staple; simplified for cash+outside-finance | Med | From current deal state |
| **Deal templates** (FL cash retail / FL outside-financed / wholesale / consignment) preconfigure fee structure | Removes "did I forget the tire fee" errors | Low | Settings entity: template with default fee list |
| **Audit trail of every deal edit with actor + before/after** | Disputes happen | Low | Trivial with `ActivityLog` |
| **Saved deal scenarios** ("A: cash" vs "B: trade + outside finance") | Close by showing options without losing data | Med | Drafts relation on Deal |
| **Customer-facing deal share link** (read-only OTD breakdown) | Customer reviews math on phone before arrival | Med | `app/u/[token]` generalizes |
| **Variance explainer** ("over-allowance $X, doc fee waived $X, pack $X") on gross | Manager understands deltas instantly | Low | Structured rendering of the adjustment journal |

### Anti-Features

| Anti-Feature | Why | Instead |
|---|---|---|
| **Retail Installment Contract (RIC) generation** | Reg Z/TILA + state forms + licensing. Locked out | Outside finance only — lender provides RIC |
| **Subprime lender routing / Dealertrack-style submission** | Paid networks with credentialing; out of scope | Customer arranges their own financing |
| **Spot delivery with conditional contracts** | Source of unwinds and litigation | Separate compliance-reviewed milestone if ever |
| **Full F&I menu beyond GAP/VSC** | Opens Reg M, possible insurance licensing | Stay with GAP + VSC, simple add-to-deal form |
| **DMS-side credit decisioning** | That's the lender's job | Store reseller's decision; don't make decisions |
| **Real-time payment calculator with APR** | Cash + outside finance only — lender computes APR | Show "estimated monthly" only if lender provides, disclose as estimate |

---

## 4. DOCUMENTS (FL cash + outside-financing packet)

PROJECT.md lists: purchase agreement, deposit, bill of sale, FTC Buyers Guide + as-is, federal odometer disclosure, FL HSMV forms, POA, privacy notice. Adding what may be missing.

### Table Stakes — FL packet additions / clarifications

| Document | Purpose | Complexity | FL? | Notes |
|---|---|---|---|---|
| **HSMV 82040** (Application for Certificate of Title) | Title transfer to buyer | Low | **Yes** | LOW conf on current form #; verify |
| **HSMV 82042** (POA for title transactions) | Dealer signs title docs on buyer's behalf | Low | **Yes** | LOW conf on form # |
| **HSMV 82139** (Notice of Sale / Bill of Sale) | Notifies state of transfer | Low | **Yes** | LOW conf on form # |
| **HSMV 82994** (Title Reassignment Supplement) | When title runs out of reassignment lines | Low | **Yes** | LOW conf; rare but real |
| **Federal Odometer Disclosure** | Truth in Mileage Act | Low | No | Already in PROJECT.md. Rule changed recently to disclose for vehicles up to ~20 model years — LOW conf on current threshold |
| **FTC Buyers Guide (English + Spanish)** | FTC Used Car Rule; Spanish required if negotiation was in Spanish | Low | No (federal/FL-enforced) | Updated FTC rule in recent years — LOW conf on current template version |
| **As-Is acknowledgment** | Standard for used FL absent dealer-offered warranty | Low | **Yes** | |
| **GLBA Privacy Notice** | At every NPI collection event | Low | No | Already in PROJECT.md |
| **FCRA Risk-Based Pricing / Credit Score Disclosure** | When credit was pulled | Low | No | Triggers at Phase 6 pulls |
| **Adverse Action notice delivery** | If denied, FCRA window | Low | No | Reseller generates; we store/deliver |
| **Sales tax exemption documentation** (out-of-state buyer, dealer-to-dealer) | Without proof, dealer is liable | Low | **Yes** | FL DR-123 affidavit for nonresident buyers — LOW conf on form # |
| **Lien satisfaction / payoff confirmation** (trade with lien) | Title chain | Low | No | |
| **Insurance verification (FL PIP/PDL minimums) before delivery** | Required for registration | Low | **Yes** | $10K PIP + $10K PDL — LOW conf on current state |
| **Wholesale bill of sale / dealer-to-dealer docs** | No Buyers Guide, no consumer disclosures | Low | No | |
| **Consignment agreement** | Commission %, term, dispute terms | Med | No | One-time template per intake |
| **POA: limited POA for title work** | Already in PROJECT.md | Low | **Yes** | |
| **ESIGN/UETA consent capture pre-signing** | Both federal ESIGN and FL UETA require explicit consent + log | Low | No (federal/FL) | E-sign provider captures; verify it's logged on our side too |

### Differentiators

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| **Per-deal packet bundling by deal type** (cash retail / outside-finance / wholesale / consignment / out-of-state) | No manual checklist | Med | Doc-set definition by deal template |
| **Document version tracking** | When a form changes, know which deals signed on old version | Low | Store template version on signed packet |
| **Embedded signing in customer's browser** (BoldSign/Anvil embedded, not redirect) | DealerCenter often kicks to third party — bad UX | Med | Provider supports |
| **Pre-fill + customer confirmation flow** (review on phone before walking in) | Closer pickups | Med | Generated link to customer's phone with prefilled packet |
| **Automated retention scheduler** | FL dealer recordkeeping (~5 years — LOW conf) — auto-flag retention milestones | Med | Needs scheduled jobs (queue dependency) |
| **Searchable signed-packet archive** with OCR'd cover sheet | Beats DealerCenter's "find that March deal" | Med | R2 already; add Document index w/ tags |
| **Hash + audit certificate per signed packet** stored in R2 | Real legal defensibility | Low | Store the cert URL the provider returns |
| **"Packet completeness" pre-flight check** | Before signature: VIN matches title, odometer present, tag info entered, GAP/VSC attached if sold, lender check info present, etc. | Med | Rules engine per deal type |
| **Spanish-language packet for Spanish-speaking buyers** | Real FL concern, often ignored — compliance + UX win | Med | Spanish form templates — extra work but pays off |

### Anti-Features

| Anti-Feature | Why | Instead |
|---|---|---|
| **Self-rolled cryptographic signature execution / trusted timestamp** | Locked out in PROJECT.md — legally indefensible | BoldSign/Anvil embedded |
| **Generating state forms from scratch via pdf-lib alone** | Layout drift can invalidate filings | Use actual official PDF as template; pdf-lib fills overlays. Keep unmodified official PDF in repo |
| **Notary integration / online notary** | Consumer-side rarely needed in FL used-car sales; lien releases are lender's problem | Skip |
| **Title work / HSMV submission automation** | Months of compliance work; titling services already exist | Use a titling service; we generate the packet they need |
| **Custom contract template builder UI for staff** | Templates = legal docs. Letting non-lawyers edit = malpractice trap | Versioned in git, reviewed by counsel, deployed via migration |

---

## 5. CREDIT APPLICATIONS

PROJECT.md locks: integrate 700Credit or eLEND CreditPlus, no SSN/DOB stored locally, soft-pull prequal → hard-pull on real deals.

### Table Stakes

| Feature | Why | Complexity | Notes |
|---|---|---|---|
| Application capture form | Reseller submission data | Low | Min: name, address, DOB (transient), SSN (transient), employer/income (reseller-dependent), housing |
| Permissible-purpose attestation logging (FCRA) | Required compliance record | Low | `ActivityLog`; field: `purpose: prequal | retail_deal_pending` |
| Soft-pull prequal (no FICO impact) | Customer-facing; shoppers see what they qualify for | Low (integration) | Reseller provides; consent first |
| Hard-pull on real deal (with consent) | When deal is going to fund | Low (integration) | Reseller provides |
| Consumer consent capture (signed + timestamped) | FCRA + ESIGN/UETA | Low | As a Document (e-sign packet) |
| Adverse-action delivery | If denied, within FCRA window | Low (integration) | Reseller generates; we email + store PDF |
| Credit pull artifact storage (provider URL only) | We store references; reseller stores PII | Low | `CreditPull { applicationId, providerRefId, providerArtifactUrl, score?, decision?, decisionAt? }` |
| Red Flags / OFAC screening | Reseller typically bundles | Low (integration) | Result as artifact; flagged = deal halt |
| GLBA-safe access controls | Only roles w/ permissible purpose; every view logged | Med | RBAC upgrade (Phase 1) + view-log on credit records |

### Differentiators

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| **Customer self-serve soft-pull prequal on a public link** | Lead → qualified lead without sales rep | Med | `app/u/[token]` infra; reseller hosted form embeds well |
| **Score + decision visible on the Deal, NOT the Contact** | Score is deal-context, not contact-permanent. Less leakage | Low | Schema choice |
| **"View credit" requires re-prompt for permissible-purpose reason** | Every view logged with reason | Low | Modal on view → `ActivityLog` |
| **Auto-redaction of credit info in screenshots / exports** | Reduces PII leak | Med | Lower priority unless screenshots are shared often |
| **Time-to-decision tracking + alerting** | Pull taking too long → deal held up | Low | Scheduled check on pulls older than N hours |

### Anti-Features

| Anti-Feature | Why | Instead |
|---|---|---|
| **Storing raw SSN / DOB locally** | GLBA / state privacy — massive liability | Reseller-only — locked in PROJECT.md |
| **Direct bureau (Experian/TU/Equifax) integration** | Multi-year credentialing | Reseller — locked |
| **In-house FICO / scoring** | Not in scope | Skip |
| **Tri-merge / multi-bureau merging** | Lender activity, not dealer | Accept reseller's standard format |
| **Application status push to outside lenders (Dealertrack-style)** | Locked by "no in-house finance / no Dealertrack" scope | Skip |
| **Custom co-buyer / spouse credit logic beyond reseller's native support** | Joint adverse-action complexity | Mirror what reseller supports natively |

---

## 6. QUICKBOOKS ONLINE SYNC

PROJECT.md: sync funded deals, cost adds, flooring payoffs to QBO API.

### Table Stakes

| Feature | Why | Complexity | Notes |
|---|---|---|---|
| OAuth + token refresh | Intuit OAuth 2.0 | Low | Tokens encrypted at rest |
| Chart-of-accounts mapping configuration | Mikalyzed's CoA is theirs; we map events → accounts in settings | Med | Default suggestions, accountant-confirmable |
| **Used vehicle sale journal entry** on funded deal | DR Cash/AR, DR COGS, CR Vehicle Inventory (cost), CR Sales Revenue, CR Sales Tax Payable, CR Doc Fee Income, etc. | High | Multi-line JE per funded deal. Reversible on unwind |
| **Cost add → vehicle inventory increase** | Each non-pack CostAdd raises cost basis | Med | DR Vehicle Inventory, CR AP/Cash |
| **Flooring payoff entry** on deal funding | DR Flooring Liability, CR Cash | Med | Connects flooring record to deal funding |
| **Trade-in acquisition entry** | DR Vehicle Inventory (ACV), CR Customer Deposit / Sales Discount (over-allowance) | Med | Subtle — wrong = inventory overstated |
| **F&I product entries** (GAP/VSC) | DR Cash/AR, CR F&I Income (retail); DR F&I COGS, CR AP (provider cost) | Med | Standard F&I accounting |
| **Sales tax liability entry** | DR Cash, CR Sales Tax Payable | Low | From deal calc |
| **Customer / Vendor sync (one-way to QBO)** | No re-typing | Med | On deal funding, push Customer; push Vendors |
| **Failed-sync queue with retry + manual override** | API hiccups; solo operator can't tolerate silent failures | Med | Job queue + admin "stuck syncs" page. Queue is a cross-cutting infra dependency |
| **Idempotency** — re-sync same deal doesn't double-post | Critical with retries | Med | Store QBO entry ID on Deal; check before posting |

### Differentiators

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| **Pre-defined CoA template for FL used-car dealer** | Bootstraps accounting setup | Low | JSON of suggested names |
| **Classes / Locations on every entry (multi-store-ready)** | Costs nothing now, avoids painful migration later | Low | Hard-code "Mikalyzed"; configurable later |
| **Pre-sync preview** ("here's the JE we're about to push, confirm") for first N days post go-live | Solo operator catches mapping errors | Med | Optional admin confirmation step |
| **Per-deal "accounting health" indicator** | synced ✓ / pending / failed / reversed | Low | Computed from sync state |
| **End-of-month reconciliation report** | Our funded deals vs QBO sales entries should match | Med | Phase 9 report |
| **Two-way refresh of Vendor / Customer changes** | Optional pull-down when accountant updates QBO | Low | Phase 10+ — one-way push is simpler for v1 |

### Anti-Features

| Anti-Feature | Why | Instead |
|---|---|---|
| **QuickBooks Desktop integration** | Web Connector is dying | QBO API only — already in PROJECT.md |
| **Generic "Invoice" approach for vehicle sales** | Loses tax-on-trade nuance + COGS timing | Proper JEs for vehicle sales |
| **Real-time bidirectional sync** | Brittle, over-engineered for solo | Push on event; no pull except optional vendor/customer refresh |
| **Multi-currency** | Single-store FL | Skip |
| **Perpetual inventory valuation in QBO itself** | DMS = unit-level inventory ledger; QBO = financial ledger | Reconcile, don't duplicate |
| **Payroll / commissions in QBO via this integration** | Opens payroll scope | Compute commissions in DMS as report; accountant enters in payroll separately |

---

## 7. REPORTING + AI REPORTING

PROJECT.md: canned reports + extended AskAI for natural-language custom reports across the full DMS data model.

### Table Stakes — canned reports dealers actually look at

| Report | What It Shows | Frequency | Complexity | Notes |
|---|---|---|---|---|
| **Inventory aging** | Per-vehicle days + cost-to-keep-per-day + total carry-cost-to-date, bucketed 0-30/31-60/61-90/90+ | Daily | Low | Single most-checked report |
| **Front-line readiness** | What's in recon vs front-line vs available — bottleneck visibility | Daily | Low | Partially exists via stages |
| **Gross by unit** (last funded deals) | Per-deal: price / true cost / front gross / back gross / total | Daily/weekly | Low | Replaces a spreadsheet |
| **Gross by source** | Same metric grouped by acquisition source | Weekly | Low | "Where should I be sourcing?" |
| **Sales by rep** | Units / front / back / total per person, per period | Daily/weekly | Low | Commission + coaching |
| **Flooring exposure** | Outstanding principal + accrued interest by lender, total | Daily | Low | Risk dashboard |
| **Cars sold by source** | Unit count per channel | Weekly/monthly | Low | |
| **Days-to-sell distribution** | Histogram for sold cars | Weekly | Low | Pricing strategy |
| **Deal lifecycle / close rate** | Opportunities by stage, conversion %, time-in-stage | Weekly | Low | Partially exists via pipeline |
| **F&I penetration** | % deals with GAP / VSC; avg F&I gross per deal | Weekly | Low | |
| **Tax liability snapshot** | Sales tax + tire/battery fees collected; reconciles to QBO | Monthly | Low | For accountant |
| **Unwound deals** | Reversals + reasons + financial impact | Monthly | Low | Surface patterns |
| **Activity log filtered views** | "All credit pulls last 30d," "all price changes by user X" | On-demand | Low | `ActivityLog` is polymorphic |
| **Audit exports** | CSV/PDF | On-demand | Low | |

### Differentiators — AI reporting (where this beats DealerCenter)

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| **Natural-language ad-hoc reports** ("cars over 60 days with no recent media") | DealerCenter has 200 static reports, none is the one you need | Med | Existing AskAI; needs DMS data model exposed via tool-use schemas |
| **Reports that explain themselves** | "Why is this month's gross down?" → compares periods, surfaces the 2 deals that swung it | High | LOW conf on output quality without iteration. Real value if it works |
| **Anomaly alerts** | "Re-photographed 5 times — content escalation," "doc fee below your standard," "cost add 3x average for this vendor" | Med | Rule-based first; AI summary is the value-add |
| **Conversational deal-prep brief** | Sales rep before a customer: "Tell me about this customer's history" — activity log + prior interest + prior deals | Low | Trivial with existing AskAI + `ActivityLog` |
| **Cross-domain queries** | "Best rep at closing trade-ins on cars >90 days old?" — joins recon + inventory + deals + reps. Static reports can't | Med | Phase 0 unification is what enables this — the project's selling point |
| **Weekly digest auto-emailed** | Mon AM: gross / units / aging / exposure / anomalies | Med | Scheduled job (queue infra) |
| **"What if" pricing scenarios** | "Drop price by $500 — projected days-to-sell?" | High | LOW conf — needs enough historical data; Phase 10+ |
| **Saved AI queries become canned reports** | Useful query → "promote" to saved report | Low | Closes ad-hoc / canned gap |
| **Drill-down report → vehicle → activity log → message** | Aging → click vehicle → why aged (no photos? no test drives? mispriced?) | Med | UX, not new data |

### Anti-Features

| Anti-Feature | Why | Instead |
|---|---|---|
| **200 canned reports** | DealerCenter's failure mode — dealers ignore 195 | ~15 canned + great AI / ad-hoc builder |
| **PDF dashboards as primary delivery** | Stale on generation | Web-first live; PDF export available, not primary |
| **AI "predictions" / ML forecasting without enough data** | Solo dealer data volume is too small; hallucinations possible | Restrict AI to summarization / anomaly detection / ad-hoc — not forecasts |
| **Real-time WebSocket dashboards** | Locked out in PROJECT.md | Polling |
| **Multi-tenant / cross-store benchmarks** | Locked out | Skip |
| **Sharing reports outside the org** | Phase 10+ at best | Skip unless accountant integration emerges |

---

## 8. Cross-Cutting Anti-Features (whole DMS scope)

| Anti-Feature | Why |
|---|---|
| **Real-time WebSockets** | Locked in PROJECT.md. Polling is fine; don't get tempted by "live dashboards" |
| **Multi-tenant / multi-dealer** | Locked. Even introducing `tenantId` early is over-engineering |
| **New Customer table** | Locked — `Contact.contactType` handles it |
| **Mobile-first Sales / mobile IG DMs** | Explicitly paused |
| **Replacing recon workflow** | Phase 0 re-points it, doesn't rebuild |
| **Generic CMS / template builder for non-developers** | Legal docs — dev-managed only |
| **"Plugin" marketplace** | Single-store, single-dev. No |
| **Hand-rolled queue / cron / scheduler** | Vercel cron + lightweight queue, solved generically not per-feature |
| **Full auth provider migration** | Cookie auth is fine; RBAC upgrade is in scope, full swap is not |

---

## Feature Dependencies

```
Phase 0: Vehicle unification
   ↓
Phase 1: RBAC upgrade + Background jobs scaffold
   ↓
Phase 2: Inventory (cost adds, flooring math, source tracking)
   ↓
Phase 3: Media + customer/marketing
   ↓
Phase 4: Deal Desk ←──── needs Inventory cost math + Flooring payoff
   ↓
Phase 5: Documents + e-sign ←──── needs Deal Desk (fields to fill)
   ↓
Phase 6: Credit ←──── needs RBAC (view-log + reason capture), Docs (consent capture)
   ↓
Phase 7: QBO ←──── needs Deal Desk + Flooring (entries to push)
   ↓
Phase 8: Reporting + AI ←──── needs everything
```

**Cross-cutting infra multiple phases need:**
- Background job queue (flooring accrual snapshot, QBO sync retry, AI digests, packet pre-flight)
- Webhook signature validation hardening (PROJECT.md flags Twilio/IG/Graph as uneven; credit + e-sign webhooks will need this too)
- Structured error reporting (no more silent fire-and-forget) — DMS deal/document/credit cannot tolerate silent failures
- Audit-log viewer UI (data exists in `ActivityLog`; needs a query/export UI for compliance evidence)

---

## MVP Recommendation (within DMS scope)

Smallest cut that actually lets the user stop paying for DealerCenter:

**Must ship together:**
1. Phase 0 vehicle unification
2. Phase 2 inventory cost adds + flooring (manual flooring entry is fine, no integration)
3. Phase 4 deal desk with FL fees + tax math (cash + outside finance only; gross calc)
4. Phase 5 documents + e-sign (FL retail packet is legally-required path)
5. Phase 7 QBO sync (manual re-entry into QBO defeats the purpose)

**Defer to second cut:**
- Phase 3 media upgrade (existing `photos[]` works for now)
- Phase 3 marketing syndication (current state is manual anyway)
- Phase 6 credit pulls (use 700Credit's standalone UI until integrated)
- Phase 8 reporting + AI (canned first; AI last)

**Defer hardest:**
- AI reporting — depends on full data model
- Anomaly detection / predictive — needs data history

---

## FL-Specific Items Needing User Verification

Items where I have LOW confidence and the user/accountant/counsel must confirm before they become inputs to phase planning:

| Topic | What to verify |
|---|---|
| Sales tax rate + county discretionary surtax + cap on motor vehicles | Current rate + current cap on motor vehicle sales |
| Trade-in tax credit treatment | Sale price minus trade allowance = tax basis — confirm current law |
| Doc fee disclosure | Exact disclosure language + font requirements |
| Electronic title fee | Current amount (~$25 range historically) |
| Tire fee / battery fee applicability to used cars | LOW conf; confirm |
| FL UETA + ESIGN consent capture | Provider's capture flow + our log are both required |
| Used Car Rule Buyers Guide (English + Spanish) | Latest FTC template + when Spanish is required |
| HSMV form numbers (82040 / 82042 / 82139 / 82994) | All LOW conf — verify current numbers + revisions |
| Insurance minimums | $10K PIP + $10K PDL — LOW conf on current state |
| Dealer recordkeeping retention | LOW conf (~5 years commonly cited) |
| Tax exemption forms (nonresident, dealer-to-dealer) | DR-123 reference is LOW conf |

---

## Open Questions for Roadmap Phase

1. Does Mikalyzed do **any wholesale dispositions** today? If yes, Phase 4 deal desk needs wholesale flow on day one (different doc set, no tax). If rare, defer to a sub-phase.
2. Does Mikalyzed already accept **consignment intake**? If yes, Phase 4 needs consignment math + Phase 5 needs the consignment agreement on day one.
3. **Spanish-language packet** — is this a day-one need given FL customer mix, or a later add?
4. **Cross-cutting infrastructure** (queue, structured error reporting, audit-log viewer) — should be a roadmap phase of its own, not buried in feature phases. Multiple features depend on it.
5. **Pricing/market-comp data feed** (MMR / Black Book / vAuto) — paid integration; needed for AI pricing-band differentiator. Roadmap should treat this as a Phase 10+ optional, not in v1.
6. **Titling service** — Mikalyzed already has one? If so, what does the packet handoff look like? Affects Phase 5 packet definition.
