# Concerns

**Analysis Date:** 2026-06-02

A snapshot of known and inferred risk areas across the codebase: tech debt, security, performance, fragility, and gaps. These are reference points for planning — not all need immediate action.

## Security

### Webhook authentication is uneven

- **Twilio SMS webhook** (`app/api/sms/webhook/route.ts`) — uses `lib/twilio-validate.ts` for signature validation, but the project memory notes a pending todo: *"Twilio webhook signature validation"* is still listed as cleanup. Verify whether validation is enforced or optional in production.
- **Instagram/Meta webhook** (`app/api/instagram/webhook/route.ts`) — `X-Hub-Signature-256` validation is present but has fallback paths that can bypass strict checks. Project memory notes this is mid-debug (paused 2026-05-29) awaiting Meta Tester role confirmation.
- **Microsoft Graph email webhook** (`app/api/email/webhook/route.ts`) — needs cross-check that subscription `clientState` is verified on every callback. Memory mentions *"post-policy email mirror verification"* as pending.

### Auto-contact creation is an injection surface

Inbound webhooks (SMS, Instagram, possibly email) auto-create `Contact` records from external payloads with minimal validation. Any spoofed inbound message could pollute the contact database with junk contacts.

**Mitigations to consider:**
- Idempotency keys to prevent duplicate creation on webhook retries
- Rate limit per source phone/IG handle/email
- Quarantine bucket for unknown senders before they become first-class contacts

### Session model

- Session is cookie-based (`mm_user_id`, `mm_user_role`, `mm_user_name`) validated by DB lookup
- No detected session timeout, refresh, or invalidation on role change
- Role is stored in the cookie *and* in the DB — if these drift the cookie value is trusted unless re-validated in `getSessionUser()`
- No CSRF token mechanism observed (session cookies + state-mutating POSTs = classic CSRF target if the cookie is not `SameSite=Lax/Strict`)

### Webhook input validation

Webhook handlers parse `await req.json()` and proceed even when payloads are partial. Several handlers fall back to empty objects rather than rejecting malformed input — this can corrupt downstream state.

### No rate limiting

No middleware-level or per-route rate limiting was observed. Webhook endpoints, login, and AI ad generation endpoints are all potentially abusable.

## Tech Debt

### No test suite

Zero automated tests. The only quality gate is the TypeScript compiler. See [TESTING.md](TESTING.md) for the full list of untested critical paths. Highest-risk untested areas:

- Auth and RBAC (`lib/auth.ts`)
- Webhook deduplication and signature validation
- Return-queue logic (`lib/return-queue.ts`)
- Stage state machine and approval workflow
- Round-robin lead assignment

### Silent error swallowing

Many fire-and-forget operations (notifications, integration calls) catch errors and either log them to console only or drop them entirely. In production this means real failures are invisible unless someone reads Vercel function logs in real time. Patterns to look for:

- `.catch(() => {})`
- `.catch(e => console.error(e))` without alerting/retrying

### Mega page components

Some `page.tsx` files are very large monoliths (multi-thousand-line files containing forms, lists, modals, and state machines all together). They are hard to test, hard to code-split, and slow to hydrate.

Likely candidates worth splitting: vehicle detail page, mechanic schedule page, conversations page, leads page.

### Email templates file

`lib/email-templates.ts` is ~15K lines of template definitions in one file. Refactoring into per-template files would improve maintainability and tree-shaking.

### Pending template work

Project memory notes: empty Mechanic *"Sold Vehicle Inspection"* template and Detailing standard *"Detail"* template still pending. See `project_pending_templates.md`.

### Mixed schema naming

Prisma schema mixes `snake_case` legacy column names with `camelCase` modern fields. Long-term migration to a uniform convention would simplify queries and reduce confusion.

## Performance

### N+1 query risk

Several list endpoints (mechanic board, contacts, opportunities) likely build queries one record at a time when fetching related data — Prisma `include` vs. separate calls in a loop. Worth profiling under realistic load.

### Email webhook fetches per-message

The Microsoft Graph email webhook reportedly fetches messages one at a time when notified, rather than batching. Under high inbound volume this multiplies round-trips.

### JSON column queries

`VehicleStage.checklist` and similar JSON columns can't be efficiently indexed or queried via Prisma. Filtering or aggregating across JSON contents requires loading rows into memory first.

### Polling instead of real-time

The app uses `setInterval()` and manual refresh buttons for live updates (TV board, notifications, conversations). Each polling tab is a recurring DB query. A WebSocket or SSE layer would reduce DB load and improve latency.

### Single Prisma client, no pool tuning

`lib/db.ts` exports a singleton Prisma client. No detected connection pool configuration. On Vercel serverless, this can hit pool exhaustion under burst load — consider Prisma Data Proxy or PgBouncer for production scaling.

### Inventory + dashboard load entire fleet

Inventory endpoints and dashboard aggregations appear to materialize the full vehicle list before filtering/sorting in memory. Will degrade as the fleet grows.

## Fragile Areas

### Return-queue logic

`lib/return-queue.ts` handles a tricky case: a vehicle returning from external repair should *resume* its prior stage instead of restarting. Project memory flags this as actively in-progress (`project_resume_from_external.md`). Lacks tests, has interleaved state with `VehicleStage`, and is high-impact if it misbehaves.

### Vehicle stage state machine

Stage transitions (`nextStage()`, approval workflow, blocked / awaiting-parts / completed states) are scattered across multiple API routes and `lib/` files rather than centralized in one state-machine module. Easy to add a new entry point that violates an invariant.

### Notification dispatch

`lib/part-notifications.ts` and `lib/stage-notifications.ts` fire notifications as side effects of API mutations. They're fire-and-forget — if they fail silently, users miss real-world events (parts arrived, stage blocked). No retry queue.

### Contact / Opportunity auto-creation from webhooks

Inbound messages create Contact and Opportunity records on the fly. Without idempotency guarantees, webhook retries from Twilio/Meta/Microsoft can create duplicates.

### Session cookies on iOS Capacitor

The web session cookie mechanism has to work across the Capacitor WebView. Capacitor 8 generally handles this, but it's a non-obvious failure mode if cookies start dropping (e.g. after iOS upgrade, on cold launch, or with `SameSite` changes).

## Scaling Limits

- Single Prisma client globally; no connection pool tuning
- In-process token caching (e.g. M365 token cache) will not survive horizontal scale-out across multiple serverless instances
- R2 upload progress tracking (if any in-memory) breaks across instances
- No background job queue — long-running work happens inline in request handlers
- No detected feature flag system — rollouts are code-deploy-only

## Hardcoded Configuration

Several pieces of config are hardcoded rather than environment-driven:

- Timezone and working hours (likely America/Toronto or similar)
- Default email recipients for internal notifications
- Phone numbers for routing
- Stage definitions, checklist defaults (in `lib/constants.ts` — acceptable for a single-tenant app, but a barrier to multi-tenant)

If the long-term direction is multi-tenant (per the DMS direction memo `project_dms_direction.md`), all of these become per-dealer configuration that needs a settings layer.

## Domain Cutover Risk

Project memory `project_domain_cutover.md` lists pending steps for moving from the current Vercel preview domain to a real production domain:

- R2 CORS update
- Twilio webhook URL update
- Resend domain verification
- Vercel domain attach

Until cutover, any service URL change creates a coordination window with potential downtime.

## Integration-Specific Concerns

### Twilio

- Single approved number (`project_sales_messaging.md`); no failover number
- Voice routing depends on `Call` records + active user state — fragile under cold-start delays
- Webhook signature validation pending verification (see above)

### Microsoft Graph (M365 email)

- Per-user OAuth flow with refresh tokens stored in DB
- Subscription renewal cron at `app/api/email/subscriptions/renew` — if this stops running, inbound email mirror silently stops
- Token expiration / re-auth flow may not be exposed clearly to users

### Instagram / Meta

- Paused mid-debug; awaiting Tester role confirmation (`project_instagram_dms_progress.md`)
- Webhook auto-creates contacts on inbound DMs — needs verification before scaling

### Anthropic (AskAI widget)

- API key client-side risk — verify it's only used in server routes, never in client bundles
- No detected rate limiting on `/api/generate-ad` and AI chat endpoints — abusable for cost

### Cloudflare R2 / Supabase storage

- Two file storage backends in use simultaneously (R2 via `lib/r2.ts`, Supabase via `lib/supabase.ts`)
- Worth consolidating; doubles the surface for misconfiguration

## Missing Operational Features

- No structured logging / APM (Sentry, Datadog, etc.)
- No background job queue
- No webhook retry queue (if inbound webhook handler errors, message is lost)
- No audit trail for sensitive actions (login, role change, contact deletion)
- No backup/restore documented for Postgres
- No documented incident runbook

## Reference Files

- Auth gaps: `lib/auth.ts`
- Webhook surface: `app/api/sms/webhook/route.ts`, `app/api/instagram/webhook/route.ts`, `app/api/email/webhook/route.ts`
- Webhook validation: `lib/twilio-validate.ts`
- Fragile domain logic: `lib/return-queue.ts`, `lib/part-notifications.ts`, `lib/stage-notifications.ts`
- Schema / model boundaries: `prisma/schema.prisma`
- Email templates monolith: `lib/email-templates.ts`
- Build / type checking entry point: `package.json` (`scripts.build`)

---

*Concerns analysis: 2026-06-02. Findings are a snapshot — verify before acting, since some items may have been addressed since this date.*
