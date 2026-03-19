# Calendar & Events — Implementation Blueprint
### Mikalyzed Management Platform Expansion

---

## 1. PRODUCT SUMMARY

**Calendar** is an operational scheduling tool for off-site work. Any time someone on the team needs to leave the dealership — a mechanic visit, a content shoot at a client's home, a vehicle pickup, a sales meeting — it goes on the Calendar. It's not a personal planner. It's "where is our team and what are they doing outside these walls."

**Events** is a project-like planner for dealership happenings — car shows, rallies, content days, private showings, launches. Each event breaks down into responsibility sections (marketing, logistics, vehicles, content, etc.) with tasks assigned to specific people. The core value: accountability. When Saturday's show is 3 days away, admin opens the event and immediately sees what's done, what's behind, and who owns the gaps.

**How they connect to the existing platform:**
- Calendar items can link to vehicles (already in the system) and to events
- Event tasks surface in the existing My Tasks view alongside recon tasks
- Both modules feed the Dashboard with upcoming items and overdue alerts
- Both use the same user/role system, notifications, and activity logging

**How they're different from each other:**
- Calendar = time-based scheduling ("who goes where, when")
- Events = project-based planning ("what needs to happen for this event to succeed")
- A calendar item might exist independently ("pickup car from auction Tuesday") or be linked to an event ("transport show cars to venue — part of Saturday Show")

---

## 2. USER WORKFLOWS

### Calendar Workflows

**Creating a calendar item:**
1. Admin/user taps "+" on Calendar page or "New" button
2. Fills: title, type (dropdown), date/time, location, assignee(s), notes
3. Optionally links a vehicle (search by stock# or name) or an event
4. Saves → item appears on calendar, assignees get notified

**Assigning a calendar item:**
1. Creator picks assignee(s) during creation
2. Admin can reassign from item detail
3. Assignee gets notification + item appears in their filtered view

**Completing a calendar item:**
1. Assignee (or admin) taps item → marks as completed
2. Status updates, timestamp recorded
3. If linked to an event, the event's linked items reflect this

**Rescheduling:**
1. Open item → change date/time → save
2. Status auto-changes to "rescheduled" (keeps history)
3. Assignees re-notified

### Event Workflows

**Creating an event:**
1. Admin taps "New Event"
2. Fills: name, date(s), location, description, event type
3. Assigns an event owner (primary responsible person)
4. Saves as "draft" or "planned"

**Creating event sections:**
1. Inside event detail, admin adds sections (e.g., Marketing, Logistics, Setup)
2. Sections are flexible/custom — admin types the name, picks a color optionally
3. Sections can be reordered via drag

**Assigning event tasks:**
1. Inside a section, admin adds tasks
2. Each task gets: title, assignee, due date (optional, defaults to event date), priority
3. Assignee gets notified
4. Task appears in their My Tasks dashboard

**Tracking event progress:**
1. Open event → see sections with completion bars
2. Each section shows X/Y tasks done
3. Overall event shows total completion %
4. Overdue tasks highlighted
5. Admin can filter by assignee to see one person's full responsibility

---

## 3. PAGE / SCREEN PLAN

### Calendar Pages

| Page | Path | Purpose | Who Uses It | Key Actions |
|------|------|---------|-------------|-------------|
| Calendar Main | `/calendar` | View all scheduled items | All roles | Switch view (week/agenda/month), filter by type/person, tap into items |
| Calendar Item Detail | `/calendar/[id]` | View/edit one item | All roles | Edit fields, change status, complete, cancel, reschedule |
| New Calendar Item | `/calendar/new` | Create new item | Admin, coordinators | Fill form, assign, link vehicle/event |

**No separate "personal schedule" page.** The main calendar page filters by the logged-in user automatically for non-admin roles. Admins see everything with filter options.

### Event Pages

| Page | Path | Purpose | Who Uses It | Key Actions |
|------|------|---------|-------------|-------------|
| Events List | `/events` | Browse all events | All roles | Filter by status/date, tap into event |
| Event Detail | `/events/[id]` | Full event breakdown | All roles | View sections, tasks, progress, manage |
| New Event | `/events/new` | Create event | Admin | Fill details, set owner |
| Edit Event | `/events/[id]/edit` | Edit event details | Admin, event owner | Update fields, manage sections/tasks |

**Event sections and tasks are managed inline on the event detail page** — no separate pages for those. Sections expand/collapse. Tasks are added/edited inline or via a slide-up sheet on mobile.

---

## 4. UX / UI RECOMMENDATIONS

### Calendar UX

**Default view: Agenda (list) view on mobile, Week view on desktop.**

Reasoning:
- Month view looks clean but is useless for actually seeing what's happening — too compressed on mobile, you just see dots
- Week view is the sweet spot on desktop: shows time blocks, easy to scan
- Agenda view on mobile is the most usable — it's a scrolling list of upcoming items grouped by day. One tap to see details. No zooming, no tiny cells

**Mobile behavior:**
- Agenda list as default — today first, scrollable
- Compact date picker strip at top (horizontal scroll, like iOS calendar)
- Each item: colored left border (by type), title, time, assignee avatar, location
- Tap → full detail page (not a modal)
- FAB (floating action button) bottom-right to add new item

**Desktop behavior:**
- Week view with time grid (7am-8pm visible, scrollable)
- Items as blocks on the grid, colored by type
- Sidebar filter panel: by person, by type, by vehicle
- Click → slide-in drawer for quick view, "Open" button for full page

**Filtering:**
- Chips at top: All, Mine, by type (dropdown), by person (dropdown — admin only)
- Non-admin users: default filtered to their assignments, can toggle to "All" to see full team schedule
- URL-driven filters so you can share/bookmark views

**Color coding by type:**
- Mechanic visit: purple (matches recon)
- Sales meeting: blue
- Pickup/Dropoff: orange
- Content shoot: amber
- Detailing appointment: cyan
- Event-related: lime green (matches brand)
- General errand: gray

### Events UX

**Event detail page layout:**

```
┌─────────────────────────────────────┐
│ ← Back to Events                    │
│                                     │
│ Saturday Car Show          [PLANNED]│
│ Mar 22, 2026 · 10AM–4PM           │
│ Wynwood, Miami                      │
│                                     │
│ Owner: Fernando    Progress: 65%    │
│ ████████████░░░░░░                  │
│                                     │
│ ┌─ MARKETING (3/4) ──────────────┐ │
│ │ ✓ Create flyer      → Maria    │ │
│ │ ✓ Post IG reel      → Carlos   │ │
│ │ ✓ Email blast        → Maria    │ │
│ │ ○ Print banners      → Maria  ! │ │
│ └────────────────────────────────┘ │
│                                     │
│ ┌─ LOGISTICS (1/3) ─────────────┐  │
│ │ ✓ Book tent          → Alex    │ │
│ │ ○ Transport 3 cars   → Driver  │ │
│ │ ○ Setup tables       → Alex   !│ │
│ └────────────────────────────────┘ │
│                                     │
│ ┌─ CONTENT (0/2) ───────────────┐  │
│ │ ○ Shoot recap video  → Carlos  │ │
│ │ ○ Edit + post        → Carlos  │ │
│ └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Key UX choices:**
- Sections are collapsible cards — open by default if incomplete, collapsed if 100% done
- Tasks show inline: checkbox, title, assignee, overdue indicator (!)
- Add task: inline input at bottom of section (like adding a Notion block)
- On mobile: sections stack vertically, full-width cards
- Assignee shown as name (not avatar) for clarity on mobile
- Progress bar at top = instant health check
- Overdue tasks get a red left border

**Accountability without clutter:**
- The event detail page IS the accountability view
- Each task has exactly one owner (not "multiple assignees" — one person is responsible)
- If multiple people are involved, create separate tasks
- Filter by person on the event detail page: dropdown at top, dims tasks not assigned to that person

---

## 5. DATA MODEL / SCHEMA

### calendar_items

```prisma
model CalendarItem {
  id          String    @id @default(uuid())
  title       String
  type        String    // mechanic_visit, sales_meeting, pickup, dropoff, 
                        // detailing, content_shoot, event_task, errand
  date        DateTime  // start date/time
  endDate     DateTime? @map("end_date")  // optional end time
  allDay      Boolean   @default(false) @map("all_day")
  location    String?
  notes       String?
  status      String    @default("scheduled") 
                        // scheduled, confirmed, in_progress, completed, cancelled, rescheduled
  vehicleId   String?   @map("vehicle_id")
  eventId     String?   @map("event_id")
  createdById String    @map("created_by")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  vehicle     Vehicle?  @relation(fields: [vehicleId], references: [id])
  event       Event?    @relation(fields: [eventId], references: [id])
  createdBy   User      @relation("CalendarCreatedBy", fields: [createdById], references: [id])
  assignees   CalendarAssignee[]

  @@index([date])
  @@index([status])
  @@index([vehicleId])
  @@index([eventId])
  @@map("calendar_items")
}

model CalendarAssignee {
  id             String       @id @default(uuid())
  calendarItemId String       @map("calendar_item_id")
  userId         String       @map("user_id")
  createdAt      DateTime     @default(now()) @map("created_at")

  calendarItem   CalendarItem @relation(fields: [calendarItemId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id])

  @@unique([calendarItemId, userId])
  @@map("calendar_assignees")
}
```

**Why a join table for assignees:** Calendar items genuinely need multiple people. "Pick up car" might need a driver and a mechanic. A content shoot might have photographer + salesperson. Unlike event tasks (one owner), calendar items are coordination records.

### events

```prisma
model Event {
  id          String    @id @default(uuid())
  name        String
  type        String    // car_show, rally, dealership_event, content_day, 
                        // promotion, popup, giveaway, sponsor, private_showing, launch
  date        DateTime  // event start
  endDate     DateTime? @map("end_date")
  location    String?
  description String?
  status      String    @default("draft")
                        // draft, planned, active, completed, cancelled
  ownerId     String    @map("owner_id")
  createdById String    @map("created_by")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  owner       User      @relation("EventOwner", fields: [ownerId], references: [id])
  createdBy   User      @relation("EventCreatedBy", fields: [createdById], references: [id])
  sections    EventSection[]
  calendarItems CalendarItem[]

  @@index([date])
  @@index([status])
  @@map("events")
}

model EventSection {
  id        String   @id @default(uuid())
  eventId   String   @map("event_id")
  name      String   // "Marketing", "Logistics", "Content", etc.
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")

  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  tasks     EventTask[]

  @@index([eventId])
  @@map("event_sections")
}

model EventTask {
  id          String    @id @default(uuid())
  sectionId   String    @map("section_id")
  title       String
  assigneeId  String?   @map("assignee_id")
  dueDate     DateTime? @map("due_date")  // defaults to event date if not set
  priority    String    @default("normal") // low, normal, high, urgent
  status      String    @default("pending") // pending, in_progress, completed
  notes       String?
  sortOrder   Int       @default(0) @map("sort_order")
  completedAt DateTime? @map("completed_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  section     EventSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  assignee    User?        @relation("EventTaskAssignee", fields: [assigneeId], references: [id])

  @@index([sectionId])
  @@index([assigneeId])
  @@index([status])
  @@map("event_tasks")
}
```

### Relationships to existing models

```
User ──┬── CalendarAssignee (many)    "my scheduled items"
       ├── Event (owner)              "events I own"
       ├── EventTask (assignee)       "event tasks assigned to me"
       └── CalendarItem (creator)     "items I created"

Vehicle ── CalendarItem (optional)    "appointments linked to this vehicle"

Event ──┬── EventSection (many)       "sections within event"
        ├── CalendarItem (many)       "schedule items linked to this event"
        └── EventSection ── EventTask "tasks within sections"
```

### Activity Log integration
Both modules write to the existing `activity_log` table:
- `entity_type: "calendar_item"` or `"event"` or `"event_task"`
- Actions: `created`, `updated`, `status_changed`, `assigned`, `completed`, `cancelled`

### Notification integration
Both modules write to the existing `notifications` table:
- Assignment notifications
- Status change notifications
- Overdue alerts (via the existing check-overdue pattern)

---

## 6. TASK / ACCOUNTABILITY MODEL

### Event Tasks — Ownership Rules

1. **One assignee per task.** Period. If two people need to do something, create two tasks. Shared ownership = no ownership.

2. **Due date defaults to event date** if not explicitly set. This means by default, everything should be done before the event.

3. **Priority levels:** `low`, `normal`, `high`, `urgent`. Keep it simple. Urgent = this blocks the event.

4. **Status flow:** `pending` → `in_progress` → `completed`. No other states. If a task isn't happening anymore, delete it. Don't add "cancelled" status for tasks — that's clutter.

5. **Completion:** Assignee checks the box. Timestamp recorded. Irreversible without admin. This prevents "oops I unchecked it" games.

### Should event tasks appear in My Tasks?

**Yes. Absolutely.**

Here's how to do it cleanly:

The existing `/tasks` page currently queries `VehicleStage` records assigned to the user. Expand it to also query `EventTask` records assigned to the user.

**Implementation:**
- The `/api/tasks` endpoint adds a second query for `EventTask` where `assigneeId = currentUser` and `status != completed`
- Response includes both `reconTasks` and `eventTasks` as separate arrays
- The My Tasks page shows two sections:
  - **Recon Tasks** (existing vehicle stage tasks)
  - **Event Tasks** (grouped by event name)
- Each event task shows: task title, event name, section name, due date, priority badge

**Why separate sections instead of mixing them:** They're fundamentally different work. Recon tasks are ongoing vehicle work. Event tasks are project prep. Mixing them creates confusion. Grouped sections keep it clear.

### Accountability tracking for admins

On the **Event detail page**, admin can:
- See all tasks grouped by section with assignee names
- Filter by person (dropdown) to see one person's full plate
- See completion % per section and overall
- See overdue tasks highlighted red
- See unassigned tasks highlighted with a "No owner" warning

On the **Dashboard**, admin sees:
- "Upcoming Events" card with event name, date, completion %
- "Overdue Event Tasks" count if any exist

---

## 7. CALENDAR LOGIC

### Calendar items are hybrid: scheduling + lightweight task tracking

They're primarily scheduling records ("Alex goes to the auction at 2pm Tuesday") but they also track completion ("did it happen?"). They are NOT full tasks with checklists — that's what recon stages and event tasks are for.

### Scheduling rules

**Single vs multiple assignees:** Multiple allowed. Calendar items are coordination — "who's going." The assignee list answers: "who needs to be there?"

**Linked vehicle:** Optional. If a calendar item involves a specific car (pickup, content shoot), link it. Shows on the vehicle detail page as "Upcoming appointments."

**Linked event:** Optional. If a calendar item is part of an event ("transport show cars to venue"), link it. Shows on the event detail page under a "Schedule" tab.

**Status flow:**
```
scheduled → confirmed → in_progress → completed
    ↓           ↓           ↓
 cancelled   cancelled   cancelled
    
scheduled → rescheduled → (creates new item with original reference, or updates date)
```

**Rescheduling approach:** Update the date fields directly + change status to "rescheduled" momentarily (triggers notification), then back to "scheduled." Store the original date in activity_log for history. Don't create duplicate records.

**Completion:** Any assignee or admin can mark complete. Practical > precious.

**Cancellation:** Admin only. Cancelled items stay in the system (grayed out in calendar view) but can be filtered out.

### What calendar items are NOT:
- Not tasks with subtasks/checklists
- Not project management items
- Not meant to replace Google Calendar
- They're internal operational scheduling — short, focused, actionable

---

## 8. EVENT LOGIC

### Event lifecycle

```
draft → planned → active → completed
  ↓       ↓        ↓
cancelled cancelled cancelled
```

- **Draft:** Event created but not fully planned. Sections/tasks being built out. Not visible to non-admin roles yet.
- **Planned:** Event is set, tasks assigned, team can see it. This is the "working" state.
- **Active:** Event day is here or imminent. All hands on deck.
- **Completed:** Event is done. Tasks locked. Can still view for reference.
- **Cancelled:** Self-explanatory. Preserved for records.

**Transition rules:**
- Draft → Planned: Manual (admin clicks "Publish")
- Planned → Active: Manual or auto (when event date arrives)
- Active → Completed: Manual (admin marks done after event)

### Event task lifecycle

```
pending → in_progress → completed
```

That's it. Three states. Anything more is project management bloat for a dealership.

### Progress calculation

**Section progress:** `completed_tasks / total_tasks * 100`
- 3/4 tasks done = 75%
- 0 tasks = show "No tasks" instead of 0%

**Overall event progress:** `total_completed_tasks / total_tasks * 100` (across all sections)
- NOT an average of section percentages (that would weight a 1-task section equal to a 10-task section)

**Event "on track" indicator for admins:**
- Green: All tasks on track (no overdue)
- Yellow: Has overdue tasks but >50% complete
- Red: Has overdue tasks and <50% complete
- Shown as a simple dot/badge on the events list

### Event sections

**Flexible custom sections, not fixed templates.**

Reasoning: Every event is different. A car show has "Vehicles" and "Setup." A content day has "Equipment" and "Shot List." Fixed templates mean Fernando has to shoehorn every event into the same categories.

**However:** Offer suggested section names when creating (Marketing, Logistics, Vehicles, Setup, Staffing, Content, Follow-up). One tap to add, easy to rename or add custom ones. Best of both worlds.

---

## 9. REPORTING / VISIBILITY

### Calendar — Dashboard integration

**"Today's Schedule" card on Dashboard:**
- List of today's calendar items for the team
- Shows: time, title, assignee(s), location
- Admin sees all; workers see their own

**"This Week" summary:**
- Count of scheduled items this week
- Count completed vs remaining

**Useful queries:**
- Overdue items (past date, not completed/cancelled)
- Busiest team members this week (item count by assignee)
- Items by type breakdown

### Events — Dashboard integration

**"Upcoming Events" card on Dashboard:**
- Next 3 events with name, date, completion %
- Color-coded progress bar

**Event-specific reporting (on Reports page or Event detail):**
- Event readiness: completion % with days remaining
- Tasks by assignee: who has the most open tasks
- Overdue tasks: list with assignee names
- Section completion: bar chart by section

### Reports page expansion

Add two new tabs/sections to the existing Reports page:
- **Calendar Report:** Items by type, by person, completion rates, busiest days
- **Events Report:** Event history, avg completion at event time, task ownership distribution

---

## 10. IMPLEMENTATION PLAN

### Phase A: Calendar MVP (3-4 days)
- Schema + migration (calendar_items, calendar_assignees)
- API routes (CRUD + status changes)
- Calendar main page (agenda view mobile, week view desktop)
- Calendar item detail page
- New calendar item page
- Add to sidebar nav
- Notifications on assignment

### Phase B: Events MVP (3-4 days)
- Schema + migration (events, event_sections, event_tasks)
- API routes (CRUD for events, sections, tasks)
- Events list page
- Event detail page (sections + tasks inline)
- New event page
- Task completion (checkbox toggle)
- Progress calculation
- Add to sidebar nav
- Notifications on task assignment

### Phase C: Integration (2 days)
- Event tasks appear in My Tasks page
- Dashboard cards (Today's Schedule, Upcoming Events)
- Calendar items linkable to vehicles
- Calendar items linkable to events
- Vehicle detail page shows linked calendar items

### Phase D: Polish (1-2 days)
- Calendar type color coding
- Event progress indicators on list page
- Overdue highlighting
- Reports page expansion
- Mobile interaction polish (swipe, haptics)
- Filter persistence

---

## 11. ARCHITECTURE / COMPONENT PLAN

### Route structure

```
app/(app)/
├── calendar/
│   ├── page.tsx              # Calendar main (agenda + week/month views)
│   ├── new/
│   │   └── page.tsx          # New calendar item form
│   └── [id]/
│       └── page.tsx          # Calendar item detail
├── events/
│   ├── page.tsx              # Events list
│   ├── new/
│   │   └── page.tsx          # New event form
│   └── [id]/
│       ├── page.tsx          # Event detail (sections + tasks)
│       └── edit/
│           └── page.tsx      # Edit event
```

### API route structure

```
app/api/
├── calendar/
│   ├── route.ts              # GET (list, filtered), POST (create)
│   └── [id]/
│       └── route.ts          # GET, PATCH, DELETE
├── events/
│   ├── route.ts              # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts          # GET, PATCH, DELETE
│       ├── sections/
│       │   ├── route.ts      # POST (add section), PATCH (reorder)
│       │   └── [sectionId]/
│       │       └── route.ts  # PATCH (rename), DELETE
│       └── tasks/
│           ├── route.ts      # POST (add task)
│           └── [taskId]/
│               └── route.ts  # PATCH (update/complete), DELETE
```

### Shared components

```
components/
├── CalendarView.tsx           # Week/month/agenda renderer
├── CalendarAgenda.tsx         # Agenda (list) view
├── CalendarWeek.tsx           # Week grid view
├── CalendarItemCard.tsx       # Single item in list/grid
├── DateStrip.tsx              # Horizontal scrolling date picker (mobile)
├── EventCard.tsx              # Event card for list page
├── EventSection.tsx           # Collapsible section with tasks
├── EventTaskRow.tsx           # Single task row (checkbox + assignee)
├── InlineTaskInput.tsx        # Add task inline input
├── ProgressBar.tsx            # Reusable progress bar
├── UserPicker.tsx             # Assignee selector (reusable)
├── VehiclePicker.tsx          # Vehicle search/select (reusable)
├── StatusBadge.tsx            # Generic status badge (reusable across modules)
```

### Service files

```
lib/
├── calendar.ts                # Calendar constants, types, helpers
├── events.ts                  # Event constants, types, helpers
```

### Reusable patterns from existing app

- Card styling (`.card`, `.card-flat`)
- Badge system (`.badge-*`)
- Button styles (`.btn`, `.btn-primary`, etc.)
- Form inputs (`.input`, `.form-label`)
- Section labels (`.section-label`)
- Notification creation pattern (from `lib/email.ts`)
- Activity logging pattern

---

## 12. BUILD EXECUTION PLAN

### Folder structure additions

```
app/(app)/calendar/            # NEW
app/(app)/calendar/new/        # NEW
app/(app)/calendar/[id]/       # NEW
app/(app)/events/              # NEW
app/(app)/events/new/          # NEW
app/(app)/events/[id]/         # NEW
app/(app)/events/[id]/edit/    # NEW
app/api/calendar/              # NEW
app/api/calendar/[id]/         # NEW
app/api/events/                # NEW
app/api/events/[id]/           # NEW
app/api/events/[id]/sections/  # NEW
app/api/events/[id]/sections/[sectionId]/  # NEW
app/api/events/[id]/tasks/     # NEW
app/api/events/[id]/tasks/[taskId]/        # NEW
components/CalendarView.tsx    # NEW
components/CalendarAgenda.tsx  # NEW
components/CalendarWeek.tsx    # NEW
components/DateStrip.tsx       # NEW
components/EventSection.tsx    # NEW
components/EventTaskRow.tsx    # NEW
components/ProgressBar.tsx     # NEW
components/UserPicker.tsx      # NEW
lib/calendar.ts                # NEW
lib/events.ts                  # NEW
```

### First 12 implementation tasks (in order)

1. **Update Prisma schema** — Add CalendarItem, CalendarAssignee, Event, EventSection, EventTask models. Run migration.

2. **Add constants/types** — Create `lib/calendar.ts` (CALENDAR_TYPES, CALENDAR_STATUSES, type definitions) and `lib/events.ts` (EVENT_TYPES, EVENT_STATUSES, TASK_STATUSES, suggested section names).

3. **Update Nav** — Add Calendar and Events to sidebar + mobile bottom nav. Add new icons.

4. **Build Calendar API routes** — `GET/POST /api/calendar`, `GET/PATCH/DELETE /api/calendar/[id]`. Include assignee management, vehicle linking, filtering by date range/type/assignee.

5. **Build Calendar main page** — Agenda view (mobile default), week view (desktop). Date strip navigation. Filter chips. FAB for new item.

6. **Build New Calendar Item page** — Form with type dropdown, date/time pickers, location, assignee multi-select, vehicle search, notes.

7. **Build Calendar Item Detail page** — View/edit item, change status, complete/cancel actions.

8. **Build Events API routes** — `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/[id]`, section CRUD, task CRUD.

9. **Build Events list page** — Cards showing event name, date, type, status, completion %, owner.

10. **Build Event Detail page** — Hero card with overview + progress. Collapsible sections with inline tasks. Checkbox completion. Inline task adding.

11. **Build New Event page** — Form with name, type, date(s), location, description, owner picker. Section builder with suggested names.

12. **Integrate with My Tasks** — Update `/api/tasks` to include event tasks. Update Tasks page to show event tasks in a separate section.

---

## OPINIONATED ANSWERS TO YOUR QUESTIONS

### 1. Should Calendar and Events be separate top-level modules?
**Yes.** They solve different problems. Calendar = scheduling (time-first). Events = project planning (outcome-first). Merging them would create a confusing hybrid. Two sidebar items, two mental models. Clean.

### 2. Should event tasks appear in the global My Tasks dashboard?
**Yes.** A task is a task regardless of where it came from. If Carlos is assigned "Shoot recap video" for Saturday's show, he needs to see it alongside his "Content photos for BMW" recon task. But they should be in **separate sections** on the page, not mixed together.

### 3. Should calendar items be allowed to be assigned to multiple people?
**Yes.** Calendar items are coordination records. "Vehicle pickup from auction" might need a driver and a salesperson. A content shoot might need photographer + model handler. Multiple assignees answers "who needs to be there?"

Event tasks, on the other hand: **one assignee only.** Accountability requires a single owner.

### 4. Should event sections be fixed templates or flexible custom sections?
**Flexible custom sections** with **suggested defaults.** Every event is different. A car show needs "Vehicles" and "Setup." A content day needs "Equipment" and "Shot List." But offer quick-add buttons for common ones (Marketing, Logistics, Vehicles, Setup, Staffing, Content, Follow-up) so admins don't start from scratch.

### 5. Should mobile calendar default to agenda/list view even if desktop has week/month?
**Yes.** Agenda view is the only view that actually works well on a phone. Week/month grids are unreadable on mobile — tiny cells, impossible to tap. Agenda = scrolling list grouped by day = scannable, tappable, fast.

Desktop gets week view by default with toggle to month/agenda.

### 6. What is the cleanest way to show accountability by person without too much clutter?
**Inline assignee names on tasks + a person filter at the top.**

Don't build a separate "accountability dashboard." The event detail page IS the accountability view. Each task row shows: checkbox, title, assignee name, due indicator. That's it. The filter dropdown at the top of the event page lets admin select a person to dim everything else — instantly see one person's full plate.

For cross-event accountability: the My Tasks page already handles this. If Fernando wants to know "what does Carlos owe across all events?" — that's Carlos's My Tasks view filtered to event tasks.

---

*Blueprint complete. Ready to build on your go.*
