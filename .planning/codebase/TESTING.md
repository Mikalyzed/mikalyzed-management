# Testing

**Analysis Date:** 2026-06-02

## Summary

**There is no automated test suite in this repository.**

The codebase relies entirely on:
1. TypeScript strict mode (compile-time type checking)
2. Manual verification in browser / iOS app
3. Production observation (console logs, Vercel function logs)

## Search Evidence

- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files found outside `node_modules`
- No test directories: no `__tests__/`, `tests/`, `test/`, `e2e/`, `cypress/`, `playwright/`
- No test runner dependencies in `package.json`: no `jest`, `vitest`, `mocha`, `@testing-library/*`, `cypress`, `playwright`, `puppeteer`, `supertest`
- No test scripts in `package.json` (`scripts` section contains only `dev`, `build`, `start`, `postinstall`, and Capacitor sync commands)
- No CI config that would run tests (no `.github/workflows/*test*` referenced)

## Type Checking as QA

The de facto quality gate is the TypeScript compiler, invoked implicitly by `next build`:

```bash
npm run build   # runs `prisma generate && next build` — fails on TS errors
```

- `tsconfig.json` has `strict: true` enabled
- `noImplicitAny`, `strictNullChecks`, etc. all on by default under `strict`
- Prisma generates strict types from `prisma/schema.prisma` on `postinstall`
- A build failure during `next build` is the closest thing to a failing test

## Manual Verification Workflow

Based on patterns visible in `package.json` and project memory:

**Local web dev:**
```bash
npm run dev                              # localhost:3000 (Turbopack)
```

**iOS app (Capacitor):**
```bash
npm run cap:dev                          # sync iOS pointed at localhost
npm run cap:prod                         # sync iOS pointed at production
npm run ios:open                         # open Xcode for TestFlight build
```

**Build verification:**
```bash
npm run build                            # full prisma generate + next build
```

This is the canonical "tests pass" signal — it catches TS errors and missing exports but not behavior bugs.

## What's Tested Implicitly

The following are partially "tested" by the type system:

- **API request/response shapes** — Prisma return types flow through to API handlers and back to clients
- **Component props** — TypeScript catches missing/wrong-shaped props at compile time
- **Database queries** — Prisma client rejects invalid field/relation references
- **Route params** — Next.js typed routes catch some malformed dynamic segments

## What Is NOT Tested

Risk areas with no automated coverage:

- **Auth logic** (`lib/auth.ts`) — session validation, role checks
- **RBAC** — `requireRole`, `canSeeAllLeads`, `canAccessOpportunity` — no tests verify gating
- **Webhook handlers** — Twilio SMS, Instagram DMs, Microsoft Graph emails all have non-trivial signature validation, deduplication, and contact-creation logic with no tests
- **Return-queue logic** (`lib/return-queue.ts`) — stage re-entry after external repair (memory notes this as a fragile, important area)
- **Stage state machine** — `nextStage()` advancement, approval workflow, blocked/awaiting-parts transitions
- **Round-robin lead assignment** — weighted distribution logic
- **Email template rendering** (`lib/email-templates.ts`, ~15K lines) — no snapshot or rendering tests
- **Integration error paths** — Twilio/Graph/Meta failures and retries
- **iOS-specific behavior** — Capacitor plugins, native bridge calls, deep links

## Test Infrastructure Notes for Future Work

If introducing tests, decisions to make:

**Runner:** Vitest pairs naturally with the Next.js + TS + ESM (`"type": "module"`) setup. Jest works but needs more config.

**Component testing:** `@testing-library/react` is the standard pairing.

**API route testing:** Next.js App Router routes can be tested by importing the handler function directly and passing a `Request` object. No HTTP server needed.

**Database:** Prisma's `--no-engine` or a separate test database. The current schema uses PostgreSQL, so test setup likely needs a local Postgres or a transactional rollback wrapper.

**Mocking:** Twilio, Microsoft Graph, Anthropic, Resend, R2/S3, and Supabase clients all instantiated in `lib/*.ts` — they would need to be mockable. Currently they are not wrapped behind interfaces, so refactoring may be needed for clean mocking.

**E2E:** Playwright recommended for end-to-end browser tests if added. Capacitor iOS would need separate device/simulator-driven testing.

## Reference Files

- Type config: `tsconfig.json`
- Build pipeline: `package.json` (`scripts.build`)
- Schema source of truth (drives types): `prisma/schema.prisma`
- Auth surface (untested, security-critical): `lib/auth.ts`
- Webhook surface (untested, externally exposed): `app/api/sms/webhook/route.ts`, `app/api/instagram/webhook/route.ts`, `app/api/email/webhook/route.ts`

---

*Testing analysis: 2026-06-02*
