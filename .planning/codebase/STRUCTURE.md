# Codebase Structure

**Analysis Date:** 2026-06-02

## Directory Layout

```
mikalyzed-management/
├── app/                        # Next.js app directory
│   ├── layout.tsx              # Root layout (metadata, viewport)
│   ├── page.tsx                # / → redirects to /dashboard
│   ├── login/                  # Public login page
│   ├── privacy/                # Public privacy policy page
│   ├── terms/                  # Public terms of service page
│   ├── (app)/                  # Protected feature routes (auth required)
│   │   ├── layout.tsx          # App layout (Nav, VoicePhone, AskAI)
│   │   ├── dashboard/          # Main dashboard + analytics
│   │   ├── vehicles/           # Vehicle lifecycle (mechanic → publish)
│   │   ├── pipelines/          # Sales pipeline builder
│   │   ├── leads/              # Lead management
│   │   ├── contacts/           # Contact directory
│   │   ├── conversations/      # Message threads (SMS, email, DM)
│   │   ├── inventory/          # Available vehicle inventory
│   │   ├── parts/              # Parts tracking and ordering
│   │   ├── transport/          # Vehicle transport coordination
│   │   ├── calendar/           # Calendar events and scheduling
│   │   ├── tasks/              # Task board (mechanic tasks)
│   │   ├── mechanic-schedule/  # Mechanic daily schedule + timer
│   │   ├── content-schedule/   # Content calendar
│   │   ├── events/             # Events with sections and tasks
│   │   ├── external/           # External repair tracking
│   │   ├── admin/              # Admin settings panel
│   │   ├── settings/           # Settings (stages, checklists, dispositions, round-robin)
│   │   ├── team/               # Team member management
│   │   ├── reports/            # Reports and analytics
│   │   ├── porter/             # Porter task queue
│   ├── u/                      # Public upload link pages (no auth)
│   ├── tv/                     # TV board display (shop floor)
│   └── api/                    # API route handlers (38 resource endpoints)
│       ├── auth/               # Login/logout
│       ├── vehicles/           # CRUD for vehicles
│       ├── stages/             # Stage updates, approval
│       ├── contacts/           # Contact CRUD, search
│       ├── opportunities/      # Pipeline opportunities
│       ├── pipelines/          # Pipeline CRUD
│       ├── messages/           # Message CRUD
│       ├── tasks/              # Task board CRUD
│       ├── events/             # Event CRUD with sections/tasks
│       ├── parts/              # Part CRUD, notifications
│       ├── transport/          # Transport coordination
│       ├── calendar/           # Calendar items
│       ├── notifications/      # Notification fetch, mark-read
│       ├── sms/                # Twilio SMS webhook + send
│       ├── email/              # M365 email webhook + send + subscriptions
│       ├── instagram/          # Meta webhook + send DM
│       ├── voice/              # Twilio voice (twiml, incoming, status, transcription)
│       ├── upload/             # File upload to Supabase
│       ├── upload-links/       # Public S3/R2 presigned URLs
│       ├── content-board/      # Content task board
│       ├── content-schedule/   # Content calendar
│       ├── mechanic-board/     # Mechanic schedule display
│       ├── board-tasks/        # Board task management
│       ├── task-approvals/     # Manager approval workflow
│       ├── vendors/            # Vendor search, CRUD
│       ├── checklist-templates/ # Stage checklist templates
│       ├── settings/           # Settings (dispositions, round-robin, stages, lead-sources)
│       ├── reports/            # Analytics endpoint
│       ├── dashboard/          # Dashboard data aggregation
│       ├── users/              # User management
│       ├── tv-board/           # TV board data (no auth)
│       ├── fetch-listing/      # Web scraping for auto details
│       ├── generate-ad/        # AI ad copy generation
│       ├── external/           # External repair tracking
│       ├── porter/             # Porter queue data
│       ├── eod-report/         # End-of-day reporting
│       ├── weekly-plan/        # Weekly planning data
│       ├── parts-check/        # Parts inspection
│
├── components/                 # Reusable React components (15 files)
│   ├── Nav.tsx                 # Main navigation sidebar (responsive)
│   ├── VoicePhone.tsx          # Twilio voice call widget
│   ├── AskAI.tsx               # Anthropic Claude chat widget
│   ├── NotificationBell.tsx    # Notification dropdown
│   ├── VehicleCard.tsx         # Vehicle display card
│   ├── VehicleSearch.tsx       # Vehicle search/selector
│   ├── VendorSearch.tsx        # Vendor search/selector
│   ├── ReconTaskCard.tsx       # Recon task with timer
│   ├── RichTypePreview.tsx     # Inspection item preview
│   ├── RichTypeReadout.tsx     # Inspection item display
│   ├── StageTemplatesInline.tsx # Checklist template editor
│   ├── AddPartModal.tsx        # Add part modal
│   ├── OrderPartModal.tsx      # Order part modal
│   ├── StageBadge.tsx          # Stage status badge
│   ├── KanbanScrollbar.tsx     # Custom kanban scrollbar
│
├── lib/                        # Business logic and utilities (21 files)
│   ├── db.ts                   # Prisma client singleton
│   ├── auth.ts                 # Session auth, role checking
│   ├── constants.ts            # Stages, roles, labels, defaults
│   ├── crm.ts                  # CRM utilities
│   ├── email.ts                # Email utilities
│   ├── email-templates.ts      # Email template library (15K lines)
│   ├── calendar.ts             # Calendar type labels/colors
│   ├── checklist-fields.ts     # Checklist field validation
│   ├── format.ts               # Date/time formatting
│   ├── twilio.ts               # Twilio SDK initialization
│   ├── twilio-validate.ts      # Twilio webhook signature validation
│   ├── graph.ts                # Microsoft Graph email integration
│   ├── supabase.ts             # Supabase client
│   ├── cloudinary.ts           # Cloudinary SDK
│   ├── r2.ts                   # Cloudflare R2 presigned URLs
│   ├── events.ts               # Event utilities
│   ├── inventory-status.ts     # Inventory status logic
│   ├── inspection-issues.ts    # Inspection issue definitions
│   ├── part-notifications.ts   # Part status notifications
│   ├── stage-notifications.ts  # Stage event notifications
│   ├── return-queue.ts         # Return-from-external queue logic
│
├── prisma/                     # Database schema
│   └── schema.prisma           # Prisma schema (30+ models)
│
├── public/                     # Static assets
│   ├── fonts/                  # Custom font files
│   └── ...                     # Images, icons
│
├── middleware.ts               # Next.js middleware (session check, webhook bypass)
├── next.config.ts              # Next.js configuration
├── tailwind.config.ts          # Tailwind CSS config
├── tsconfig.json               # TypeScript configuration
├── capacitor.config.ts         # iOS app configuration
├── package.json                # Dependencies and scripts
├── postcss.config.mjs          # PostCSS configuration
├── vercel.json                 # Vercel deployment config
│
├── ios/                        # iOS Capacitor app
├── docs/                       # Documentation
└── .planning/                  # GSD planning (auto-generated)
```

## Directory Purposes

**app/:**
Root Next.js app directory. Contains page routes (UI) and API route handlers.

**app/(app)/:**
Protected routes requiring authentication. Organized by feature domain (vehicles, sales, messaging, etc.). Each folder contains a `page.tsx` and optional `_components/` folder.

**app/api/:**
RESTful API endpoints organized by resource. Each folder contains `route.ts` and optional nested routes for sub-resources.

**components/:**
Reusable React components used across pages. Includes navigation, modals, cards, widgets. All client-side with `'use client'`.

**lib/:**
Business logic, utilities, and integrations. Auth, database, email templates, Twilio, Microsoft Graph, file storage, domain logic.

**prisma/:**
Prisma ORM schema defining database models and relationships.

**public/:**
Static files served at root (fonts, images).

**ios/:**
Xcode iOS project generated by Capacitor. Built from web app.

## Key File Locations

**Entry Points:**
- `app/layout.tsx` — Root HTML layout
- `app/(app)/layout.tsx` — App wrapper (sidebar, modals)
- `app/login/page.tsx` — Login form
- `app/page.tsx` — Redirect to dashboard

**Core Features:**
- `app/(app)/dashboard/page.tsx` — Main dashboard
- `app/(app)/vehicles/[id]/page.tsx` — Vehicle detail + stage work
- `app/(app)/leads/page.tsx` — Sales leads
- `app/(app)/pipelines/page.tsx` — Sales pipelines
- `app/(app)/conversations/page.tsx` — Message threads
- `app/(app)/mechanic-schedule/page.tsx` — Mechanic task board with timer

**Configuration:**
- `lib/constants.ts` — Stage definitions, role labels, default checklists
- `prisma/schema.prisma` — Data model
- `lib/auth.ts` — Session and role logic
- `middleware.ts` — Route protection rules

**Integrations:**
- `lib/twilio.ts` — SMS/voice SDK
- `lib/graph.ts` — Microsoft 365 email API
- `app/api/instagram/webhook/route.ts` — Meta Instagram DMs
- `lib/r2.ts` — Cloudflare R2 file URLs
- `app/api/voice/*` — Twilio voice handling

**API Endpoints (critical):**
- `app/api/auth/login` — Session creation
- `app/api/vehicles` — Vehicle CRUD
- `app/api/stages/[id]` — Stage updates, checklist
- `app/api/task-approvals/[id]` — Manager approval workflow
- `app/api/dashboard` — Dashboard data aggregation
- `app/api/sms/webhook` — Inbound SMS
- `app/api/email/webhook` — Inbound email from M365
- `app/api/instagram/webhook` — Inbound/outbound Instagram DMs

## Naming Conventions

**Files:**
- Page files: `page.tsx` (Next.js pages)
- API routes: `route.ts` (Next.js API handlers)
- Components: `PascalCase.tsx` (React components)
- Utilities: `kebab-case.ts` (lib utilities)
- Prisma schema: `schema.prisma`

**Directories:**
- Feature folders in `app/(app)/`: lowercase (vehicles, leads, pipelines)
- API routes: lowercase with hyphens (sms-webhook, instagram-send)
- Dynamic routes: `[id]` or `[paramName]` syntax
- Internal component folders: `_components` (underscore prefix hides from router)

**Components:**
- Modal components: `*Modal.tsx`
- Card components: `*Card.tsx`
- Layout components: `Nav`, `*Layout.tsx`
- Utility components: `*Search.tsx`, `*Selector.tsx`

**Database Models (Prisma):**
- PascalCase table names: `Vehicle`, `VehicleStage`, `Contact`, `Opportunity`
- snake_case field names in schema: `stock_number`, `current_assignee_id`
- Relations use descriptive names: `@relation("CurrentAssignee")`

## Where to Add New Code

**New Feature Page:**
1. Create folder: `app/(app)/my-feature/`
2. Add page: `app/(app)/my-feature/page.tsx` (use `'use client'` for interactivity)
3. Add components: `app/(app)/my-feature/_components/*.tsx` (optional)
4. Create API route: `app/api/my-feature/route.ts`
5. Add Prisma model if needed: edit `prisma/schema.prisma`
6. Update navigation: edit `components/Nav.tsx` to add link

**New API Endpoint:**
- Create: `app/api/resource/route.ts` for main CRUD
- Nested: `app/api/resource/[id]/action/route.ts` for sub-actions
- Webhooks: `app/api/webhook-name/webhook/route.ts` (skip auth in middleware.ts)
- Pattern: Import `prisma` from `lib/db`, `getSessionUser()` from `lib/auth`, return `NextResponse.json()`

**New Component:**
- Shared: `components/MyComponent.tsx`
- Feature-specific: `app/(app)/feature/_components/MyComponent.tsx`
- Always use `'use client'` at top if using hooks
- Import utilities from `lib/` as needed

**New Utility/Service:**
- Add to: `lib/my-service.ts`
- Export functions/constants
- Import in API routes or components
- Examples: `lib/twilio.ts`, `lib/graph.ts`, `lib/email-templates.ts`

**Database Changes:**
1. Edit: `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name describe_change`
3. Prisma auto-generates types
4. Update API routes to use new fields

## Special Directories

**app/u/[token]/:**
- Purpose: Public vehicle upload links (no auth required)
- How it works: External customers access inspection upload pages via email token
- Committed: Yes
- Generated: No

**app/tv/:**
- Purpose: Shop floor TV board display
- Protected: No (publicly accessible with optional code)
- Use case: Real-time mechanic schedule, stage progress, overdue alerts

**.next/:**
- Purpose: Build output directory
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**ios/:**
- Purpose: Xcode iOS app (Capacitor wrapper around web)
- Generated: Partially (by `npx cap sync ios`)
- Committed: Xcode project structure only, not build artifacts

**prisma/:**
- Contains: Schema and generated client
- Generated: `prisma-client` is auto-generated on postinstall
- Committed: Yes (schema.prisma)

---

*Structure analysis: 2026-06-02*
