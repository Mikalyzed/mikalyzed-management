# Architecture

**Analysis Date:** 2026-06-02

## Pattern Overview

**Overall:** Next.js 15 full-stack application with server components, client-side state management, and API route handlers. This is a **dealership operations management system** structured as a CRM/workflow engine for vehicle lifecycle management, sales pipelines, and team coordination.

**Key Characteristics:**
- Next.js App Router (pages in `app/(app)/` with nested routes for features)
- Prisma ORM with PostgreSQL backend
- Client-side React components with hooks for form state
- Middleware-based session protection
- Role-based access control (RBAC) at the route and API level
- Integration-heavy: Twilio, Instagram DMs, Microsoft Graph (Outlook email), Supabase storage, Cloudinary, Resend

## Layers

**Presentation (UI) Layer:**
- Purpose: React components and pages for user interfaces
- Location: `app/(app)/*/page.tsx` (40 feature pages), `components/*.tsx` (15 reusable components)
- Contains: Page components (client-side with `'use client'`), forms, modals, cards, navigation
- Depends on: API routes via fetch(), library utilities (`lib/*.ts`)
- Used by: Browser clients (web and Capacitor iOS app)

**API Layer (Route Handlers):**
- Purpose: RESTful endpoints for data fetching, mutations, and webhook handling
- Location: `app/api/*/route.ts` (110+ routes across 38 resource endpoints)
- Contains: GET/POST/PATCH/DELETE handlers using `NextResponse`, session validation, error handling
- Depends on: Prisma client (`lib/db`), auth helpers (`lib/auth`), integrations (Twilio, Graph API, Instagram webhooks)
- Used by: Frontend pages, mobile app, external webhooks (Twilio, Meta, Microsoft)

**Data Layer (Persistence):**
- Purpose: Database schema and ORM
- Location: `prisma/schema.prisma` (Prisma schema), `lib/db.ts` (singleton Prisma client)
- Contains: User, Vehicle, VehicleStage, Contact, Opportunity, Message, Event, Task, Part models + relationships
- Depends on: PostgreSQL database
- Used by: All API routes via `prisma.*` queries

**Business Logic/Service Layer:**
- Purpose: Domain-specific logic, integrations, email/SMS/voice handling
- Location: `lib/*.ts` (21 utility files)
- Contains:
  - Auth: `auth.ts` (session, role checking)
  - Integrations: `twilio.ts`, `graph.ts` (M365 email), `r2.ts` (R2 storage)
  - Notifications: `part-notifications.ts`, `stage-notifications.ts`
  - Domain: `inspection-issues.ts`, `checklist-fields.ts`, `return-queue.ts`
  - Email templates: `email-templates.ts` (15K lines of template definitions)
  - Utilities: `calendar.ts`, `constants.ts`, `format.ts`, `crm.ts`, `events.ts`
- Depends on: External SDKs, database queries
- Used by: API routes, client components

**Infrastructure/Configuration:**
- Location: `middleware.ts`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `capacitor.config.ts`
- Purpose: Route protection, build config, styling, native app config

## Data Flow

**Vehicle Workflow (Core Domain):**

1. **Vehicle Created** → `POST /api/vehicles` → Prisma creates Vehicle + VehicleStage (mechanic)
2. **Stage Work** → User updates checklist in `app/(app)/vehicles/[id]` → `PATCH /api/stages/[id]`
3. **Task Approval** → Mechanic marks stage complete → creates TaskApproval → manager approves via `PATCH /api/task-approvals/[id]`
4. **Stage Advance** → Approved → `nextStage()` logic moves vehicle → creates new VehicleStage
5. **Parts Management** → Mechanic requests part → `POST /api/parts` → part shows in `app/(app)/parts` → status tracked
6. **Completion** → Vehicle exits 'publish' stage → vehicle status = 'completed', `completedAt` timestamp

**Sales Pipeline/Opportunity Flow:**

1. **Lead Imported** → `POST /api/contacts` or webhook → Contact created
2. **Opportunity Created** → `POST /api/opportunities` → assigned to sales rep
3. **Notes/Tasks Added** → `POST /api/opportunities/[id]/notes`, `POST /api/opportunities/[id]/tasks`
4. **Messages Sent** → Email via `lib/graph.ts` (M365), SMS via `lib/twilio.ts`, Instagram via Meta webhook
5. **Disposition Logged** → `POST /api/opportunities/[id]/disposition` → affects round-robin weighting

**Messaging Inbound:**

- **Twilio SMS** → `POST /api/sms/webhook` → creates Message record
- **Instagram DM** → Meta webhook POST → `app/api/instagram/webhook/route.ts` → creates Message or Contact
- **Microsoft Graph Email** → subscription webhook → `app/api/email/webhook/route.ts` → creates Message record, mirrors to database

**State Management:**

- **Session**: Stored in cookies (`mm_user_id`, `mm_user_role`, `mm_user_name`), validated via `getSessionUser()` on every request
- **Page State**: React hooks (useState/useEffect) in client components, fetches from API on mount
- **Shared Context**: None detected; components pass data via props or make independent API calls
- **Real-time**: No WebSocket/realtime detected; polling via `setInterval()` or manual refresh buttons

## Key Abstractions

**Vehicle Stage Lifecycle:**
- Purpose: Encapsulates the workflow state of a vehicle within a single stage (mechanic → detailing → content → publish)
- Examples: `app/api/stages/[id]` route, `lib/return-queue.ts` (handles stage re-entry after external repair), `ReconTaskCard.tsx` (displays active stage work)
- Pattern: Status enum (pending, in-progress, completed, blocked, awaiting-parts), checklist as JSON array, active timer tracking

**Contact/Opportunity Model (CRM):**
- Purpose: Unified contact record that can be a lead, prospect, or customer; linked to sales pipeline
- Examples: `prisma.contact`, `prisma.opportunity`, `app/(app)/contacts/page.tsx`, `app/(app)/leads/page.tsx`
- Pattern: Contact has multiple Opportunities, each in a Pipeline/Stage. Messages are threaded by Contact.

**Checklist as Data:**
- Purpose: Flexible task list per vehicle stage, defined by template or custom
- Examples: `VehicleStage.checklist` (JSON), `lib/checklist-fields.ts` (field validation), `lib/constants.ts` (DEFAULT_CHECKLISTS per stage)
- Pattern: Checklist items are objects with `{ name, status, priority, detail, subFields }`, rendered inline in stage card

**Message Threading:**
- Purpose: Aggregates SMS, email, and DMs into a single conversation per Contact
- Examples: `prisma.message`, `app/api/messages/route.ts`, `app/(app)/conversations/page.tsx`
- Pattern: Messages linked to Contact, grouped by direction (inbound/outbound) and channel (sms, email, instagram)

**Notification System:**
- Purpose: Alert users to important state changes (parts arriving, tasks due, stage blocked, etc.)
- Examples: `prisma.notification`, `app/api/notifications/route.ts`, `components/NotificationBell.tsx`
- Pattern: Role-specific and context-aware (e.g., part notifications only notify assignee)

**Role-Based Access Control:**
- Purpose: Gate routes and API endpoints by user role
- Examples: `lib/auth.ts` (requireRole, canSeeAllLeads, canAccessOpportunity), middleware.ts (session check)
- Pattern: Roles: admin, mechanic, detailer, content, sales, sales_manager, coordinator, porter. Admin bypasses all checks.

## Entry Points

**Web Frontend:**
- Location: `app/layout.tsx` → `app/(app)/layout.tsx`
- Triggers: User navigates to `/` → redirects to `/dashboard` (via `app/page.tsx`)
- Responsibilities: Root layout wraps all authenticated pages with Nav, VoicePhone, AskAI components. Reads session cookies and applies responsive layout (mobile vs desktop sidebar).

**Login Flow:**
- Location: `app/login/page.tsx` → `POST /api/auth/login`
- Triggers: Unauthenticated user hits `/dashboard` → redirected by middleware to `/login`
- Responsibilities: Username/password form, sets session cookies on success

**API Entrypoints (by domain):**
- **Vehicles**: `app/api/vehicles/route.ts`, `app/api/stages/[id]/route.ts`
- **Sales**: `app/api/contacts/route.ts`, `app/api/opportunities/route.ts`
- **Messaging**: `app/api/sms/webhook` (inbound), `app/api/email/webhook` (inbound), `app/api/instagram/webhook` (inbound)
- **Tasks/Events**: `app/api/tasks/route.ts`, `app/api/events/route.ts`
- **Integrations**: `app/api/voice/*`, `app/api/upload/*`, `app/api/send-email`

**Webhooks (External):**
- `POST /api/sms/webhook` — Twilio sends inbound SMS, creates Message
- `POST /api/email/webhook` — Microsoft Graph notifies of new emails, creates Message
- `POST /api/instagram/webhook` — Meta sends inbound/outbound DMs, creates Message/Contact
- `POST /api/voice/incoming` — Twilio sends incoming call, creates Call record + routes to available user

**TV Board Display:**
- Location: `app/tv/page.tsx` → `app/tv/layout.tsx`
- Triggers: Shop TV displays `/tv` with `?code=` (no auth required)
- Responsibilities: Real-time display of mechanic schedule, stage progress, overdue alerts

## Error Handling

**Strategy:** Centralized error catching at API route level; client-side toast/alert for user feedback.

**Patterns:**

- **Auth Errors:** `if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`
- **Validation Errors:** Check required fields, return `{ status: 400 }` with error message
- **Database Errors:** Catch Prisma exceptions, return `{ status: 500 }` or specific error (e.g., unique constraint)
- **Integration Errors:** Wrap Twilio/Graph/Meta calls in try/catch, return error status
- **Client-side:** Fetch response checked via `if (!r.ok) throw new Error()`, caught in component `.catch()`, displayed in modals or inline messages

## Cross-Cutting Concerns

**Logging:**
- Debug logging visible in console (browser dev tools, server logs)
- Webhook routes have explicit logging (e.g., Instagram webhook logs at each step)
- No centralized logging service detected; relies on stdout/console

**Validation:**
- Input validation at API route level (check required fields, type assertions)
- Client-side form validation (basic HTML5 attributes, manual checks)
- Prisma schema enforces unique constraints, foreign keys

**Authentication:**
- Session cookie-based (`mm_user_id` cookie)
- Validated on every request via `getSessionUser()` in lib/auth.ts
- Middleware at `middleware.ts` blocks unauthenticated access to protected routes
- No JWT tokens detected; session is cookie + database lookup

**Authorization:**
- Role enum in `lib/constants.ts`: admin, mechanic, detailer, content, sales, sales_manager, coordinator, porter
- Role checks via `requireRole(userRole, allowedRoles)` helper in `lib/auth.ts`
- `canSeeAllLeads(role)` and `canAccessOpportunity(user, opp)` for granular access
- Admin role bypasses all checks; other roles have explicit role lists per endpoint

**Timing/Scheduling:**
- Active timer tracking on stages: `timerStartedAt`, `activeSeconds`, pause/resume logic in `ReconTaskCard.tsx`
- Cron jobs: Email subscription renewal at `app/api/email/subscriptions/renew` (triggered by external scheduler)
- No scheduled tasks detected in app itself; external cron must call endpoints

---

*Architecture analysis: 2026-06-02*
