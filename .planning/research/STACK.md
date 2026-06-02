# Technology Stack — DMS Milestone (New Capabilities Only)

**Project:** Mikalyzed DMS (DealerCenter replacement)
**Milestone:** Subsequent — DMS build on existing Next.js 15 + Prisma 6 + Postgres app
**Researched:** 2026-06-02
**Scope:** ONLY the additions needed for the DMS milestone. The baseline stack (Next.js, Prisma, Twilio, Graph, Resend, R2, Cloudinary, Anthropic, Capacitor) is documented in `.planning/codebase/STACK.md` and is NOT restated here.

> **Source-availability disclaimer (read before relying on this file)**
>
> In this research session, WebSearch, WebFetch, Bash, and Context7 were all unavailable due to environment restrictions. Every recommendation below is therefore drawn from Claude's training data (knowledge cutoff January 2026) and from the in-repo `.planning/PROJECT.md` and `.planning/codebase/*.md` context — no live verification of 2026 pricing, current versions, or feature parity was possible. Confidence levels reflect this honestly. Before locking provider contracts (especially BoldSign/Anvil and 700Credit/eLEND) or implementing any pricing-sensitive flow, **the user must verify current pricing pages and API docs directly**. Treat the choices below as strong defaults to falsify, not facts.

---

## Recommended Stack — At a Glance

| Capability | Recommended | Rationale (one line) | Confidence |
|------------|-------------|----------------------|------------|
| PDF generation + AcroForm prefill | `pdf-lib` (already npm-available) | Pure-JS, Vercel-friendly, mature AcroForm fill + flatten | HIGH (training) |
| PDF complex layout / templating (if needed) | `pdfme` as escape hatch | Template-based, JSON-driven, runs serverless | MEDIUM |
| Embedded e-signature | **BoldSign** (Syncfusion) | Best-priced embedded plan in the bracket, REST API + audit certificate, signing UI is iframe-embeddable | LOW–MEDIUM (verify 2026 pricing) |
| E-signature fallback | Dropbox Sign (HelloSign) | Larger market, more battle-tested API; pricier | LOW–MEDIUM |
| Credit reseller | **700Credit** (direct integration) | Largest US dealer credit reseller, well-documented API partner program, takes FCRA/GLBA/Red Flags off your books | LOW (verify partner onboarding + current pricing) |
| Credit reseller fallback | eLEND CreditPlus | Comparable bureau aggregator if 700Credit onboarding is gated | LOW |
| QuickBooks Online API | Official Intuit OAuth 2.0 + `node-quickbooks` (community) OR raw fetch with `intuit-oauth` (official) for token mgmt | Official OAuth lib for token refresh; thin REST wrapper for JournalEntry/Bill/Invoice writes | MEDIUM |
| VIN decode (baseline, free) | NHTSA vPIC `DecodeVinValuesExtended` | Free, no API key, decodes year/make/model/body/engine; weak on trim | HIGH (NHTSA is government, stable) |
| VIN decode (trim + options, paid) | **DataOne Vehicle Database API** (or Chrome Data / JD Power if DataOne pricing is gated) | Strongest trim+options coverage in the indie-dealer bracket | LOW (pricing not verifiable here) |
| FL deal math (tax, surtax, doc fee, trade allowance) | **Build in-house** with rates table in DB | No good library exists; rules change; one-time cost is small; you already own the deal model | HIGH |
| Trusted timestamp / cryptographic sealing | **Rented** via e-signature provider — do NOT hand-roll | Self-generated timestamps are self-serving evidence and fail in dispute | HIGH |
| SSN/DOB storage | **None locally** — provider holds NPI (700Credit) | GLBA Safeguards / scope reduction | HIGH |

---

## 1. PDF Generation & Form Prefill

### Recommended: `pdf-lib` (primary) + `pdfme` (escape hatch)

**`pdf-lib`** — already the de-facto pure-JS PDF library for Node + browser. AcroForm field reading/filling/flattening is first-class; runs in any serverless environment (Vercel Functions, Edge if needed for some operations); zero native dependencies.

| Why pick it | What it does NOT do |
|-------------|---------------------|
| Pure JS — no `pdftk`, no Ghostscript, no Lambda layer drama | **Does not cryptographically sign** the PDF — embedding a CMS/PAdES signature requires extra work or a 3rd-party library; you don't need this because the e-sig provider handles sealing |
| Loads existing template PDFs (your purchase agreement, Buyers Guide, FL HSMV forms) and fills AcroForm fields by name | XFA forms are unsupported — many state forms have shifted to AcroForm, but some FL HSMV PDFs may still be XFA; **action: pre-validate every form template once at intake** |
| Flatten after fill so values can't be edited downstream | No table autoflow, no advanced layout — that's `pdfme`'s job |
| Active project; widely used | — |

**`pdfme`** — template-based PDF generator. Use as **escape hatch** for cases where:
- You need to render a fully-generated PDF from scratch (e.g. a Mikalyzed-branded internal deal recap, gross sheet, marketing flyer) instead of filling a vendor PDF.
- A government form is gnarly enough that template authoring via `pdfme`'s designer beats hand-mapping coordinates in `pdf-lib`.

> **Do not use** `pdfkit` (canvas-style draw API; painful for form prefill), `puppeteer`/Chromium HTML-to-PDF (too heavy for Vercel, slow cold starts, fonts headache), or `wkhtmltopdf` (unmaintained, native binary). Stay pure-JS.

### Specifically for Phase 5 doc set

| Document | Source PDF | Fill strategy |
|----------|-----------|---------------|
| FTC Buyers Guide + As-Is | FTC template | `pdf-lib` AcroForm fill + checkbox toggle |
| Federal Odometer Disclosure | TR-308 / federal form | `pdf-lib` AcroForm fill |
| Purchase Agreement / Bill of Sale | **In-house template** (own it) | Author once in Word/Acrobat with named fields, fill via `pdf-lib` |
| FL HSMV (e.g. HSMV 82040, 82042, 82050) | flhsmv.gov | `pdf-lib` if AcroForm; otherwise overlay text at fixed coordinates (still `pdf-lib`); **pre-test every form once** |
| Deposit receipt | In-house | `pdf-lib` |
| Privacy notice / GLBA | In-house | Static PDF — generate once, store, reference URL on every deal |
| Power of Attorney | FL HSMV 82053 | Same as HSMV |

### Install

```bash
npm install pdf-lib
# optional
npm install @pdfme/generator @pdfme/common
```

**Confidence: HIGH (training data)** — pdf-lib's role in the Node ecosystem is well-established; for the indie-dealer doc set this is the right primitive.

---

## 2. Embedded E-Signature

### Hard rules first (apply regardless of provider)

1. **You MUST integrate** a provider that issues a completion certificate with a trusted timestamp (RFC 3161 or equivalent) and a cryptographic seal on the final PDF. Hand-rolled "I checked a box and we wrote the time" is **inadmissible-grade evidence** in any dispute and is the single biggest legal trap on the DMS roadmap. The PROJECT.md correctly locks this as integrate-not-build.
2. **ESIGN + UETA consent** (FL adopted UETA) — the signing flow MUST capture explicit "I agree to sign electronically" consent BEFORE the first signature. All major providers do this; if you ever fork to a custom flow, do not remove it.
3. **Audit log retention** — every signed packet's audit certificate (the provider's PDF showing IP, timestamps, signer identity, consent capture) MUST be stored in R2 alongside the signed PDF. **The audit certificate IS the evidence, not the signed PDF alone.**

### Provider ranking (for an indie-dealer single-tenant DMS, cash + outside finance only)

> Pricing below is **directional from training data, not verified**. Verify on the live pricing pages before signing.

| Provider | Strengths | Weaknesses | Fit |
|----------|-----------|------------|-----|
| **BoldSign** (Syncfusion) | Modern REST API, embedded signing iframe, native template fields, audit certificate, REST + JS SDK, generally the cheapest "real" embedded plan in the bracket | Smaller market share = smaller community of integration examples; vendor lock if Syncfusion changes strategy | **Top pick** — best price/performance for a solo-dev shop that needs embedded signing without paying enterprise rates |
| **Anvil** | PDF prefill + e-sign in one platform (you could collapse pdf-lib + e-sign into Anvil); excellent developer DX; "Etch" packets bundle multiple PDFs into one signing flow | Per-document and per-monthly-packet pricing can climb fast at deal volume; PDF prefill features overlap with what you'd otherwise build in `pdf-lib` for free; you'd pay for convenience | **Consider only if** you want to outsource prefill too; otherwise paying twice for capability |
| **Dropbox Sign** (HelloSign) | Mature API, big market, lots of examples, Dropbox-backed reliability | Embedded signing tier historically more expensive than BoldSign; pricing tiers gate features | **Fallback** if BoldSign's audit certificate or embed UX falls short in evaluation |
| **DocuSign** | The category leader; everyone recognizes the brand | **Overkill** for this scope; pricing optimized for enterprise SaaS; embedded signing API plans start higher than competitors; brand recognition is not a developer-facing feature; the buyer pool already trusts you in person — you don't need the DocuSign halo | **Skip** — overkill given cash + outside finance only |
| **SignWell** (formerly Docsketch) | Cheap | Embedded signing feature set has historically been thinner | Skip |
| Build it yourself | $0 | Loses every dispute; do not do this | **Do not** |

### Why BoldSign is the lead recommendation

1. **Embedded signing is in the plan** — not behind an enterprise-only paywall like DocuSign.
2. **REST API + Node SDK** — fits the Next.js API-route pattern; no exotic build steps.
3. **Audit certificate** — PDF with IP, signer identity, timestamps, consent. Store this in R2 next to the signed packet.
4. **Templates with named fields** — define your purchase-agreement template once on BoldSign with named fields, populate via API. Two-tier strategy: (a) `pdf-lib` for fully in-house docs you control, (b) BoldSign template for the things you want signed.
5. **Price** — generally undercuts Dropbox Sign and DocuSign at comparable volumes; **verify on the pricing page before locking**.

### What "good integration" looks like for this codebase

- **Provider abstraction layer**: `lib/esign.ts` exposing `createSigningSession`, `getCompletionCertificate`, `getSignedDocument`, `getEnvelopeStatus`. Implementation backed by BoldSign initially. If you ever migrate, you change the implementation; deal/document code stays the same.
- **Webhook for completion**: BoldSign webhook → `app/api/esign/webhook/route.ts` → verify signature → fetch signed PDF + audit certificate → store in R2 → mark `Document.status='signed'` → write `ActivityLog` entry.
- **Never trust** the redirect-back URL alone — only the webhook + a server-side fetch is the source of truth.
- **Store** the audit certificate URL on `Document` so it can be surfaced in any dispute.

### Install

```bash
# BoldSign Node SDK (verify current package name)
npm install boldsign
```

**Confidence: LOW–MEDIUM** — provider rankings reflect training-data tradeoffs; **verify pricing + embedded-tier feature flags on each provider's pricing page before committing.**

---

## 3. Credit Reseller (Soft + Hard Pulls)

### The non-negotiable

Indie dealers **cannot** integrate Experian / Equifax / TransUnion directly without (a) being a credentialed reseller subscriber, (b) passing an on-site physical inspection, (c) carrying CRA-grade compliance liability, and (d) typically committing to enterprise pricing. **The PROJECT.md correctly locks this as integrate-not-build.** Going through a reseller transfers the FCRA permissible-purpose checks, Red Flags Rule identity verification scaffolding, and (with most resellers) the OFAC scan + risk-based-pricing notice generation to the provider.

### Recommended: 700Credit (direct integration)

| Why | Detail |
|-----|--------|
| Market position | Largest US dealer-focused credit reseller; integrations into nearly every major DMS — strong signal that their API + onboarding works for indie dealers |
| Product coverage | Soft pull (prequal, no consumer impact), hard pull (with permissible purpose + signed credit app), OFAC, Red Flags, RBPN (risk-based pricing notice), adverse action notice generation, ID verification |
| Compliance posture | They are the credentialed reseller; FCRA permissible-purpose audit lives with them; GLBA Safeguards on raw NPI lives with them |
| Onboarding | Account application + dealer license verification + signed reseller agreement; expect onboarding to take days, not minutes — **flag this as Phase 6 lead-time risk in the roadmap** |
| Storage model | You store **provider references only** (pull ID, score, decision flag, adverse action PDF URL); NOT raw SSN/DOB. PROJECT.md already locks this. |

### Fallback: eLEND CreditPlus

- Comparable bureau aggregator targeted at independent dealers; documented dealer-facing integration model.
- Choose only if 700Credit onboarding is gated by volume or paperwork in a way that blocks Phase 6.
- The integration shape (soft → hard, webhook return, adverse action artifact storage) is essentially identical.

### What NOT to do

- **Do NOT** integrate Plaid/Experian Consumer Connect/etc. — those are consumer-permissioned credit data, NOT dealer permissible-purpose credit data; wrong product for this use case.
- **Do NOT** store SSN/DOB locally, even encrypted — that puts you in GLBA Safeguards scope for those fields. Let the reseller hold the NPI; you reference by their pull ID.
- **Do NOT** auto-trigger hard pulls — soft prequal first; hard pull only on an active deal with a signed credit app. PROJECT.md already implies this; enforce it in code with a `creditAppSignedAt` precondition.

### Compliance lifeline (do this on EVERY credit pull)

1. Capture **permissible purpose** at the call site (the signed credit app reference) — write to `ActivityLog`.
2. Capture **actor** — who in the dealership initiated the pull — write to `ActivityLog`.
3. Store **adverse action notice PDF URL** if returned (decline / counter-offer cases) — link to `CreditApplication`.
4. Restrict **read access** to credit records via RBAC — sales reps see "decision flag", not score, unless they're sales_manager or admin. Audit every read in `ActivityLog`. (GLBA Safeguards expects this.)

### Install

- No npm package — both providers are HTTP REST. Build a thin `lib/credit.ts` wrapper with `softPrequal`, `hardPull`, `getResult(pullId)`. Mock implementation for local dev so Phase 6 can be developed without a sandbox account.

**Confidence: LOW (for pricing/onboarding specifics; verify directly with both providers).** The strategic shape — "rent the credentialing, don't build it" — is HIGH confidence.

---

## 4. QuickBooks Online API (Phase 7)

### Recommended approach

- **Official OAuth library:** `intuit-oauth` (Intuit-published) — handles the OAuth 2.0 dance, token refresh, signature/JWT.
- **HTTP wrapper:** Either (a) raw `fetch` against the QBO REST endpoints, or (b) the community `node-quickbooks` library — **lean toward raw `fetch` + small typed wrapper.** `node-quickbooks` is older, callback-style, and Promise-wrapping it is more work than just writing `fetch` calls against the well-documented REST endpoints.

### What you actually need to call

| QBO Entity | Purpose in DMS |
|------------|----------------|
| `Customer` | Mirror Mikalyzed retail buyers (post-deal-funded only) |
| `Vendor` | Mirror auction/wholesale sources and parts suppliers |
| `Item` (Inventory or Non-Inventory) | One per vehicle? Or one generic "Vehicle Sale" item? — **decision needed: most independent dealers use one generic item + memo-based line items to avoid bloating the QBO item list with thousands of one-off VINs** |
| `Invoice` or `SalesReceipt` | Funded retail deal → SalesReceipt (cash) or Invoice (financed, paid by lender) |
| `Bill` | Cost adds, flooring interest accrual, recon parts |
| `JournalEntry` | Catch-all for gross profit recognition, trade-in transfers, accruals — **use sparingly**; prefer real document types so the QBO accountant view stays readable |
| `Payment` | Lender ACH receipt for financed deals |
| `Account` (read) | Chart of accounts lookup for posting |

### OAuth specifics (training-data baseline)

- Authorization Code flow with refresh token rotation.
- Access tokens are short-lived (1h order); refresh tokens are long-lived (~100 days) but **rotate on every refresh** — store the new refresh token every time or you'll get locked out.
- Sandbox company + production company are separate OAuth realms; environment-switched.
- Webhooks are available for entity changes (signed payload) — use if you ever want bidirectional sync; one-way push (DMS → QBO) is sufficient for Phase 7.

### Sync model (recommended)

- **One-way push, DMS → QBO** for Phase 7. No reverse sync.
- **Idempotency**: store `qboEntityId` on `Deal`, `CostAdd`, `FlooringEvent`. Re-pushing is a no-op (update by ID).
- **Failure handling**: a QBO push that fails MUST land in a retry queue, not be silently swallowed. PROJECT.md flags silent-error swallowing as a known concern — Phase 7 cannot inherit that pattern. Recommend a simple `IntegrationJob` table with status + retry count + last error, polled by a Vercel Cron route.

### Install

```bash
npm install intuit-oauth
# optionally:
# npm install node-quickbooks
```

**Confidence: MEDIUM** — Intuit's published OAuth library + REST docs are stable; specific 2026 endpoint changes weren't verified.

---

## 5. VIN Decode

### Two-tier strategy (this is the standard pattern)

1. **Free baseline: NHTSA vPIC** — `DecodeVinValuesExtended` endpoint, no API key, no rate limit issues for indie-dealer volume. Returns make, model, year, body class, drive type, engine, transmission, vehicle type, manufacturer plant, GVWR, ABS/airbag info. **Coverage of trim and packaged options is weak-to-none** — vPIC stops at OEM-reported attributes.
2. **Paid layer for trim + options**: needed because resale price + listing accuracy depend on trim (LX vs EX vs Sport vs Touring) and option packages, which vPIC does not reliably give you.

### Paid VIN providers — ranking

| Provider | Strengths | Weaknesses | Fit |
|----------|-----------|------------|-----|
| **DataOne Vehicle Database API** | Strongest trim/options/packages coverage in the indie-dealer bracket; dealer-friendly contracts | Pricing not public — annual contract typical | **Top pick** — purpose-built for this exact problem |
| **Chrome Data / JD Power PIN** | OEM-grade data; the gold standard | Enterprise pricing; typically too expensive for solo-dev / indie-dealer scope | Aspirational — request quote, but DataOne likely wins on price |
| **VinAudit** | API access, cheaper | History-focused (NMVTIS records, title brands) rather than trim/options depth | Use for **history checks**, not as the primary trim decoder |
| **MarketCheck / VinCheckPro** | Listing-data driven (used-car market) | Trim accuracy depends on listing corpus; can be noisy on rare configurations | Useful for comp pricing later; not for intake decode |
| **CarFax / AutoCheck** | History reports | Not a structured decode API for trim/options | Already handled by other tools at your dealership; not in scope here |

### Recommendation

- **Free path always**: vPIC on every VIN intake — captures the "for free" 80%.
- **Paid path**: DataOne (or Chrome Data if budget allows) for the trim + options layer.
- **History check**: separate concern — use VinAudit (NMVTIS) or stick with whatever the dealership already pays for. Out of DMS Phase 1 scope; document as a future track.

### Implementation pattern

- `lib/vin.ts` with `decodeFree(vin)` → vPIC and `decodePremium(vin)` → DataOne. On intake, run both, prefer premium where overlap exists, fall back to free where premium is silent. Store the **raw response** from each on `Vehicle` (JSONB columns: `vpicData`, `premiumData`) so you can re-derive fields later without re-paying for the pull. Cache premium pulls indefinitely — VIN is a deterministic key.

```bash
# No SDK for vPIC — straight fetch.
# No widely-adopted SDK for DataOne — straight fetch + typed wrapper.
```

**Confidence:** HIGH for vPIC (government API, stable); LOW for DataOne pricing (verify quote directly).

---

## 6. Florida Deal Math — Build, Don't Buy

### Verdict: BUILD

No mature Node/TS library exists for FL motor-vehicle dealer tax/fee math at indie-dealer scope. The vendors who ship this (Reynolds, CDK, DealerCenter) bundle it into their DMS — that's exactly what you're replacing. The closest "library" available would be a US-wide sales-tax SaaS (Avalara, TaxJar) — these are **overkill for a single FL dealer** and don't model the motor-vehicle specifics (trade-in deduction, discretionary surtax cap, doc fee disclosure).

### Why building is correct here

1. **Rules are knowable and finite**: FL state rate, 67-county surtax rates (capped to first $5,000), trade-in deduction (trade allowance reduces taxable price), out-of-state-buyer partial-exemption rules, doc-fee handling.
2. **Rates change** — but they change rarely (annually at most for surtax). A `TaxRate` table keyed by `effectiveDate` + `county` is the entire schema.
3. **Auditability** — a hand-rolled calculator with logged inputs/outputs in `ActivityLog` is more defensible to an FL DOR auditor than a black-box library.
4. **You already own the deal model** — adding pure functions is one PR.

### Architecture

- `lib/dealmath/`:
  - `flTax.ts` — `computeStateAndSurtax({ taxablePrice, county, asOf })` returns `{ stateTax, surtax, total, breakdown }`.
  - `tradeAllowance.ts` — `applyTrade({ salePrice, tradeAllowance, payoff })` returns taxable basis after trade.
  - `docFee.ts` — adds doc fee, enforces disclosure flag.
  - `dealRecap.ts` — composes the above into the full gross sheet (sale price + fees + tax − trade allowance − payoff + flooring payoff = customer cash due / financed amount; cost adds → gross profit).
- All functions are **pure**, take primitives in and return primitives out, no DB access. Tests are trivially trivial (input/output table). PROJECT.md flags "no automated tests" — this is the layer to introduce a small test suite (Vitest, ~30 cases covering edge cases like out-of-county buyer, trade payoff > allowance, exempt buyer).
- **Rates live in DB** (`TaxRate` table, seeded once, updated by admin) — NOT hardcoded. PROJECT.md correctly warns "confirm exact rates with accountant; don't hardcode mine."

### What NOT to do

- **Do not use Avalara / TaxJar.** Overkill. Designed for retailers shipping to all 50 states. Pricing model assumes that. You are one FL dealer.
- **Do not hardcode rates.** Surtax shifts. Doc fee may change. Seed a table; admins update via UI.
- **Do not skip tests on this module.** The math is the most legally-sensitive code path you'll write that isn't already a regulated provider's problem. Tests are cheap insurance.

**Confidence: HIGH.**

---

## 7. Supporting Choices

### Background Job Queue (NEW NEED for Phase 7 retries)

PROJECT.md notes "no background job queue" as a known concern. Phase 7 (QBO sync) makes this a real problem because integration calls must retry on failure.

| Option | Fit |
|--------|-----|
| **Vercel Cron** + simple `IntegrationJob` DB table | **Recommended for v1** — already on Vercel, no new vendor, polls every N minutes, claims rows with status='pending' and a `claimedAt` lock |
| BullMQ + Upstash Redis | Adds a vendor; more powerful but heavier than needed |
| Inngest | Nice DX, free tier; introduces another integration | 
| Trigger.dev | Modern, but a third-party black box for what is essentially "retry this fetch" |

**Recommendation:** Vercel Cron + DB table. Promote to BullMQ only if Phase 7+ surfaces real throughput problems.

### Testing (NEW NEED — first tests in the codebase)

PROJECT.md notes "no automated tests; TypeScript compiler is the only quality gate" as a known concern. The DMS adds two code paths where tests are non-negotiable:
1. **`lib/dealmath/*`** — pure functions; test with Vitest.
2. **Provider abstraction layers** (`lib/esign.ts`, `lib/credit.ts`, `lib/qbo.ts`) — test the wrapper contract with mocks.

**Recommendation: Vitest** (faster than Jest, ESM-native, Next.js-compatible, zero config to add).

```bash
npm install -D vitest @vitest/ui
```

**Confidence: HIGH.**

### Webhook signature validation (HARDEN before DMS go-live)

PROJECT.md notes "webhook signature validation is uneven." New webhooks added in this milestone (BoldSign, 700Credit/eLEND, QBO) MUST validate signatures from day one. No "TODO: validate" comments. Build a `verifyHmac(secret, payload, signatureHeader)` helper and use it on every new webhook handler. This is also when the existing Twilio/Instagram validation gaps should be closed.

### RBAC upgrade

Already locked in PROJECT.md (per-module permissions). No new library — extend existing `requireRole` to `requirePermission(user, 'credit:view'|'deal:approve'|...)`. Permissions table seeded from role enum. **Audit every credit:* read** to `ActivityLog` for GLBA Safeguards compliance.

---

## Alternatives Considered & Rejected

| Category | Recommended | Alternative considered | Why rejected |
|----------|-------------|------------------------|--------------|
| PDF | pdf-lib | Puppeteer HTML→PDF | Cold start cost on Vercel; font headaches; overkill for AcroForm fill |
| PDF | pdf-lib | PDFKit | Draw-API style; bad fit for filling existing forms |
| E-sign | BoldSign | DocuSign | Overkill; enterprise pricing; brand value irrelevant to dealer use case |
| E-sign | BoldSign | SignWell | Thinner embedded feature set historically |
| E-sign | BoldSign | Build it yourself | Loses every dispute; do not |
| Credit | 700Credit | Direct bureau integration | Requires becoming a credentialed reseller; not realistic for one indie dealer |
| Credit | 700Credit | Plaid / consumer-permissioned | Wrong product — consumer-permissioned data is not dealer permissible-purpose data |
| Accounting | QBO API | CSV export to QBO | PROJECT.md already rejected; defeats the "no manual re-entry" goal |
| Accounting | QBO API | Xero, Wave | User specified QBO |
| VIN | vPIC + DataOne | vPIC alone | No trim/options — would damage listing accuracy and pricing |
| VIN | vPIC + DataOne | Chrome Data | Aspirational but likely cost-prohibitive |
| Tax/fees | Build in-house | Avalara / TaxJar | Multi-state SaaS, wrong shape, expensive |
| Queue | Vercel Cron + DB | BullMQ + Redis | Adds Redis vendor; not justified by current throughput |
| Tests | Vitest | Jest | Slower, ESM friction in Next.js 15 |
| Tests | Vitest | Playwright (E2E) | Out of scope for this milestone's core risk surface — unit tests on dealmath + provider wrappers buy more safety per hour |

---

## Installation Quick Reference

```bash
# Phase 5 — PDF + e-sign
npm install pdf-lib
npm install boldsign        # verify current package name on BoldSign docs

# Phase 6 — credit (no SDK; straight fetch via lib/credit.ts)

# Phase 7 — QuickBooks
npm install intuit-oauth

# Phase 1+ — VIN (no SDK; straight fetch via lib/vin.ts)

# Cross-cutting — testing
npm install -D vitest @vitest/ui

# Optional escape hatch
npm install @pdfme/generator @pdfme/common
```

---

## Compliance Posture Summary (FCRA / GLBA / ESIGN / UETA)

| Regime | What you owe | How this stack delivers |
|--------|--------------|-------------------------|
| **FCRA permissible purpose** | Document permissible purpose at every pull | 700Credit holds the FCRA reseller relationship; you log signed-credit-app reference + actor in `ActivityLog` on every `creditPull` invocation |
| **GLBA Safeguards** | Encrypt NPI at rest, RBAC on PII, audit log of who views credit records | No NPI stored locally (700Credit holds it); RBAC enforces `credit:view`; every read writes `ActivityLog` |
| **FTC Red Flags Rule** | Identity verification on credit transactions | 700Credit module covers this |
| **ESIGN + UETA (FL)** | Consent to sign electronically; legally-defensible audit trail | BoldSign captures explicit consent + issues completion certificate with timestamps; both stored in R2 |
| **FTC Used Car Rule** | Buyers Guide on every retail vehicle, As-Is or warranty disclosure | `pdf-lib` fills FTC template; deal cannot move to "funded" without signed Buyers Guide |
| **Federal Odometer Disclosure** | Signed disclosure on every retail sale | `pdf-lib` fills TR-308; included in BoldSign envelope |
| **FL HSMV** | Title/registration forms per FL DOR/HSMV | `pdf-lib` fills HSMV PDFs; pre-test for AcroForm vs XFA |
| **FL doc-fee disclosure** | Disclose doc fee in advertising and on the bill of sale | Deal recap PDF includes labeled doc-fee line; pre-built into `lib/dealmath/docFee.ts` |
| **FL sales tax + surtax** | Compute correctly per buyer county / out-of-state | `lib/dealmath/flTax.ts` with rates table in DB |
| **PII encryption at rest** | Postgres column-level for sensitive fields | Supabase Postgres at-rest encryption + RBAC on `Contact`; consider `pgcrypto` for any field deemed extra-sensitive |

---

## Sources & Confidence

| Area | Sources used | Confidence |
|------|--------------|------------|
| pdf-lib / pdfme positioning | Training data only (no live verification) | HIGH (positioning is well-known and stable) |
| BoldSign / Anvil / Dropbox Sign pricing | Training data only — **NOT verified against 2026 pricing pages** | LOW for specific prices; MEDIUM for relative ranking |
| 700Credit vs eLEND | Training data + PROJECT.md framing | LOW for current onboarding specifics; HIGH for strategic posture |
| QBO API (intuit-oauth, OAuth flow) | Training data — Intuit docs are stable | MEDIUM |
| NHTSA vPIC | Training data — government API, stable for years | HIGH |
| DataOne / Chrome Data positioning | Training data | MEDIUM for positioning; LOW for specific pricing |
| FL deal math (build, don't buy) | Training data + market knowledge | HIGH (the build/buy decision); the rates table itself must be verified with the dealership's accountant |
| ESIGN/UETA/FCRA/GLBA framing | Training data + PROJECT.md constraints | HIGH for posture; legal review still required before go-live |

> **Tool-availability footnote:** WebSearch, WebFetch, Context7, and Bash were unavailable in this research session. Every "verify before locking" note is genuinely necessary — do not infer "I checked their page and it's fine"; I did not. The user (or a follow-up research run with tool access) must hit BoldSign's, Anvil's, Dropbox Sign's, 700Credit's, eLEND's, and DataOne's live pricing/API pages before any contract is signed.

---

## Open Questions for Roadmap / Per-Phase Research

1. **BoldSign vs Anvil final selection** — need a live pricing comparison at ~30-50 envelopes/month volume, with embedded signing enabled, and confirmation that BoldSign's completion certificate is admissible-grade in FL.
2. **700Credit vs eLEND onboarding lead time** — both should be applied to in parallel during Phase 0/1 so Phase 6 isn't blocked.
3. **DataOne quote** — request quote during Phase 1 (inventory milestone); vPIC alone is fine for Phase 0 testing.
4. **QBO chart-of-accounts mapping** — needs dealership accountant input; one mapping doc per posting (sale → which income account; cost add → which expense account; flooring interest → which expense account; trade allowance → which contra-revenue account). This is a 1-hour accountant conversation, NOT a code problem.
5. **FL HSMV form audit** — one-time pre-flight: load every PDF in `pdf-lib`, list AcroForm fields, flag any XFA-only forms that need overlay-coordinate fallback.
6. **Background job queue threshold** — start with Vercel Cron + DB table; revisit only if Phase 7 surfaces throughput pain.

---

*Stack research (DMS milestone, new capabilities only): 2026-06-02. Verify provider pricing and onboarding requirements directly before signing contracts.*
