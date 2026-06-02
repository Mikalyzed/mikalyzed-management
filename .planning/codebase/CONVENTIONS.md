# Code Conventions

**Analysis Date:** 2026-06-02

## Tooling & Enforcement

**Linting/Formatting:**
- No `.eslintrc`, `.prettierrc`, or `biome.json` found in the repo
- No formatter scripts in `package.json`
- TypeScript strict mode (`"strict": true` in `tsconfig.json`) is the primary quality gate
- Type checking via `tsc --noEmit` (implicit, on build via `next build`)

**TypeScript Config (`tsconfig.json`):**
- Target: ES2017
- Module resolution: `bundler`
- Path alias: `@/*` → repo root
- `strict: true` (no implicit any, strict null checks, etc.)
- `allowJs: true` (mixed JS/TS supported, though codebase is TS-first)
- `isolatedModules: true` (every file is a module)

**No build hooks for style** — code style is conventional, not enforced.

## Naming

**Files:**
- React components: `PascalCase.tsx` — e.g. `VehicleCard.tsx`, `NotificationBell.tsx`, `ReconTaskCard.tsx`
- Library utilities: `kebab-case.ts` — e.g. `part-notifications.ts`, `return-queue.ts`, `email-templates.ts`
- Next.js conventions: `page.tsx`, `layout.tsx`, `route.ts` (mandated by framework)
- Schema: `schema.prisma`
- Underscore-prefixed folders (e.g. `_components/`) hide internal components from the Next.js router

**Identifiers:**
- Variables and functions: `camelCase` — e.g. `getSessionUser`, `nextStage`, `activeSeconds`
- React components and types: `PascalCase` — e.g. `Vehicle`, `VehicleStage`, `Contact`
- Constants and enums (top-level): `SCREAMING_SNAKE_CASE` — e.g. `DEFAULT_CHECKLISTS`, `ROLE_LABELS` in `lib/constants.ts`
- Prisma model names: `PascalCase` — e.g. `Vehicle`, `Opportunity`
- Prisma field names: typically `camelCase` in models; some `snake_case` for legacy columns (e.g. `stock_number`)

**Routes:**
- Feature directories under `app/(app)/`: lowercase, single word or hyphenated — e.g. `vehicles`, `mechanic-schedule`, `content-board`
- Dynamic segments: `[id]` or `[token]`
- Webhook routes: nested as `<resource>/webhook/route.ts` — e.g. `app/api/sms/webhook/route.ts`

## Component Patterns

**Client components dominate:**
- Most pages begin with `'use client'` directive
- Server components rare — this app fetches data via API routes from client components, not via server-side data loading
- Implication: hydration cost is paid on every page, but architecture is uniform

**Component structure:**
```tsx
'use client';
import { useState, useEffect } from 'react';

export default function MyPage() {
  const [data, setData] = useState<...>([]);

  useEffect(() => {
    fetch('/api/...').then(r => r.json()).then(setData);
  }, []);

  return <div>...</div>;
}
```

**Component file conventions:**
- Modals: `*Modal.tsx` (e.g. `AddPartModal.tsx`, `OrderPartModal.tsx`)
- Cards: `*Card.tsx` (e.g. `VehicleCard.tsx`, `ReconTaskCard.tsx`)
- Search/selector widgets: `*Search.tsx` (e.g. `VehicleSearch.tsx`, `VendorSearch.tsx`)
- Status badges: `*Badge.tsx` (e.g. `StageBadge.tsx`)

**Styling:**
- Tailwind CSS utility classes (Tailwind 4 via `@tailwindcss/postcss`)
- Inline `style={...}` used alongside Tailwind for dynamic values (e.g. computed colors, custom spacing)
- No CSS-in-JS library — Tailwind + inline only

## API Route Pattern

**Typical handler shape** (e.g. `app/api/vehicles/route.ts`):

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser, requireRole } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const data = await prisma.vehicle.findMany({ ... });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(user.role, ['admin', 'mechanic'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  // validation, then prisma call
  const created = await prisma.vehicle.create({ data: ... });
  return NextResponse.json(created);
}
```

**Conventions inside API routes:**
- Always `getSessionUser()` first; return 401 if absent
- Role checks via `requireRole(user.role, [...])` helper
- Use `NextResponse.json()` for both success and error
- Status codes: 200 (default), 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found), 500 (server)
- Request body parsed via `await req.json()`
- Webhooks (Twilio, Meta, Microsoft) skip session check and use signature validation instead (e.g. `lib/twilio-validate.ts`)

## Error Handling

**Server (API routes):**
- `try/catch` around external SDK calls (Twilio, Graph API, Anthropic)
- Errors converted to JSON responses with `error` field and appropriate status
- Some fire-and-forget operations swallow errors silently (e.g. notification dispatch)

**Client:**
```ts
const r = await fetch('/api/...');
if (!r.ok) {
  const err = await r.json();
  alert(err.error || 'Failed');
  return;
}
const data = await r.json();
```
- `if (!r.ok)` is the standard check
- Errors displayed via `alert()`, inline error state, or modal text
- No centralized error boundary or toast system detected

**Webhook routes:**
- Heavy console logging with bracketed scope prefixes — e.g. `console.log('[ig-webhook] received', payload)`
- Always return 200 to webhook senders to avoid retry storms, even on internal errors

## Logging

- `console.log` / `console.error` only — no centralized logger or APM SDK
- Webhook handlers use bracketed scope prefixes: `[ig-webhook]`, `[sms-webhook]`, `[email-webhook]`
- No log levels (debug/info/warn/error distinction is informal)
- Server logs land in Vercel function logs; client logs in browser console

## Imports

**Typical order (informal):**
1. React / Next built-ins (`react`, `next/server`, `next/navigation`)
2. Third-party packages (`@prisma/client`, `twilio`, `cheerio`)
3. Local libs via `@/lib/*` path alias
4. Local components via `@/components/*`
5. Relative imports for feature-internal modules

**Path alias:** `@/*` resolves to repo root (configured in `tsconfig.json`). Most imports use `@/lib/...` or `@/components/...`.

## Types

- Inline `type` and `interface` declarations within files (not centralized)
- Prisma types imported from `@prisma/client` — e.g. `import type { Vehicle } from '@prisma/client'`
- Heavy use of inline object shapes in API responses (no shared DTO layer)
- No JSDoc/TSDoc comments — relies on TS types and identifier names

## Comments

- Sparse — codebase generally lets identifiers carry the meaning
- Block comments occasionally explain non-obvious logic (e.g. return-queue stage scope)
- Webhook routes have more explanatory comments around signature validation and state transitions

## Domain Patterns

**Session check before everything:**
- `getSessionUser()` is called at the top of nearly every API route handler
- Returns `null` if no valid session cookie; routes uniformly return 401

**Role-gated actions:**
- `requireRole(role, allowedRoles)` returns boolean
- `canSeeAllLeads(role)`, `canAccessOpportunity(user, opp)` for finer-grained access in CRM

**JSON columns for flexible data:**
- `VehicleStage.checklist` is JSON — array of `{ name, status, priority, detail, subFields }` objects
- Allows checklist customization without schema migrations
- Trade-off: no DB-level validation, queries against JSON fields are limited

**Fire-and-forget notifications:**
- After a state change, notifications dispatched without awaiting result
- Pattern: `partNotify(...).catch(e => console.error(e))` — failures are logged but don't block the request

## Reference Files

- API route patterns: `app/api/vehicles/route.ts`, `app/api/stages/[id]/route.ts`
- Webhook patterns: `app/api/sms/webhook/route.ts`, `app/api/instagram/webhook/route.ts`
- Auth helpers: `lib/auth.ts`
- Component pattern: `components/VehicleCard.tsx`, `components/ReconTaskCard.tsx`
- Inline domain logic: `lib/return-queue.ts`, `lib/part-notifications.ts`
- Constants/enums: `lib/constants.ts`

---

*Conventions analysis: 2026-06-02*
