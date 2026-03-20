# CRM / Lead Engine — Implementation Blueprint
### Mikalyzed Management — Layer 2

---

## 1. PRODUCT SUMMARY

This is the GHL replacement. A lead handling and sales pipeline engine built directly into Mikalyzed Management. Leads come in from website forms, Meta ad forms, and phone calls. They land in a unified inbox, get auto-assigned to salespeople via round robin, trigger automated text/email sequences, and move through a visual pipeline until they buy or go cold.

**What makes this better than GHL for you:**
- It's connected to your inventory. When a lead is interested in a 2022 BMW M4, that link is real — not a note in a text field. When a similar car enters inventory later, the system knows who to notify.
- It's connected to your recon pipeline. You can see if a car a lead wants is still in detailing or ready for the lot.
- It's connected to your DMS (once built). Lead → Deal → Paperwork → Sold is one continuous flow, not three separate systems.
- Reporting is yours. Response times, close rates, lead source ROI, salesperson performance — all from one database.

**Core capabilities:**
- Lead capture (webhook intake from website, Meta, manual entry, phone call logging)
- Unified contact profiles (full history: texts, emails, calls, notes, linked vehicles)
- Visual sales pipeline (kanban: New → Contacted → Appointment → Showed → Negotiating → Sold/Lost)
- Round robin lead assignment with salesperson availability
- Automated sequences (text + email drips triggered by pipeline stage or lead source)
- Two-way SMS via Twilio (conversations inside the platform)
- Two-way email
- Appointment scheduling (test drives, showroom visits)
- Vehicle-lead linking (attach leads to specific inventory, and auto-notify on similar inventory arrivals)
- Lead source tracking + attribution
- Sales reporting (by person, by source, by vehicle, response times, close rates)

---

## 2. USER WORKFLOWS

### Lead Intake
1. Lead submits website form / Meta ad form / calls the dealership
2. Webhook or manual entry creates a contact + lead record
3. System auto-assigns to next salesperson via round robin
4. Automated sequence fires: immediate text ("Thanks for reaching out...") + email
5. Lead appears in salesperson's pipeline as "New"
6. Notification sent to assigned salesperson (in-app + optional SMS/email)

### Lead Working
1. Salesperson sees new lead in their pipeline
2. Opens lead → sees contact info, vehicle interest, lead source, auto-sequence status
3. Calls or texts from within the platform (Twilio)
4. Logs call outcome / sends follow-up
5. Moves lead to "Contacted"
6. If appointment set → moves to "Appointment Set" + creates calendar item automatically
7. System tracks response time (time from lead creation to first contact)

### Lead → Sale
1. Lead shows up → "Showed Up"
2. Negotiating → "Negotiating" (can attach specific vehicle from inventory)
3. Deal closes → "Sold" → lead converts to customer
4. Vehicle status updates to "sold" across the platform
5. Lost leads get a reason (price, financing, found elsewhere, ghosted, etc.) for reporting

### Vehicle-Lead Intelligence
1. Lead expresses interest in a 2022 BMW M4 → salesperson links that vehicle
2. Lead goes cold (Lost - price too high)
3. 3 months later, a similar BMW M4 enters inventory at a lower price
4. System auto-generates a notification: "3 previous leads were interested in similar vehicles"
5. Optional: auto-send a re-engagement text ("Hey [name], we just got a BMW M4 that might be perfect for you")

### Automated Sequences
1. Admin creates a sequence: "New Web Lead"
   - Immediately: SMS "Thanks for your interest in [vehicle]. This is [salesperson] from Mikalyzed..."
   - +5 min: Email with vehicle details + photos
   - +24h (if no response): SMS "Just following up on your inquiry about the [vehicle]..."
   - +72h (if no response): SMS "Still interested? Happy to answer any questions."
2. Sequences pause when the lead replies or moves stages
3. Sequences can be per lead source (website gets different messaging than Meta ads)

---

## 3. DATA MODEL

### contacts
The person. Persists across multiple leads/deals.
```
Contact {
  id              UUID
  firstName       String
  lastName        String
  email           String?       (unique if present)
  phone           String?       (unique if present, E.164 format)
  secondaryPhone  String?
  address         String?
  city            String?
  state           String?
  zip             String?
  source          String        // website, meta_ad, phone_call, walk_in, referral, other
  tags            String[]      // flexible tagging
  notes           String?
  createdById     -> User
  createdAt       DateTime
  updatedAt       DateTime
}
```

### leads
A specific sales opportunity. A contact can have multiple leads over time.
```
Lead {
  id              UUID
  contactId       -> Contact
  status          String        // new, contacted, appointment_set, showed_up, negotiating, sold, lost
  assigneeId      -> User       // salesperson
  vehicleId       -> Vehicle?   // linked inventory item
  vehicleInterest String?       // free text if no exact match ("looking for a white SUV under 30k")
  source          String        // website_form, meta_ad, phone_call, walk_in, referral
  sourceDetail    String?       // which form, which ad campaign, etc.
  lostReason      String?       // price, financing, found_elsewhere, no_response, other
  lostNotes       String?
  appointmentDate DateTime?
  firstContactAt  DateTime?     // when salesperson first reached out
  responseTimeMs  Int?          // calculated: firstContactAt - createdAt
  soldAt          DateTime?
  createdAt       DateTime
  updatedAt       DateTime

  @@index([status])
  @@index([assigneeId])
  @@index([contactId])
  @@index([vehicleId])
}
```

### conversations
Unified thread per contact. All SMS + email in one stream.
```
Conversation {
  id              UUID
  contactId       -> Contact
  channel         String        // sms, email
  lastMessageAt   DateTime
  unreadCount     Int @default(0)
  createdAt       DateTime
}
```

### messages
Individual messages within a conversation.
```
Message {
  id              UUID
  conversationId  -> Conversation
  direction       String        // inbound, outbound
  channel         String        // sms, email
  from            String        // phone number or email
  to              String
  body            String
  subject         String?       // email only
  status          String        // sent, delivered, failed, received
  twilioSid       String?       // Twilio message SID for tracking
  isAutomated     Boolean @default(false)
  sentById        -> User?      // null if automated or inbound
  createdAt       DateTime

  @@index([conversationId, createdAt])
}
```

### sequences
Automated drip campaigns.
```
Sequence {
  id              UUID
  name            String        // "New Web Lead", "Meta Ad Follow-up"
  triggerSource   String?       // lead source that triggers this, or null for manual
  triggerStatus   String?       // pipeline stage that triggers this
  isActive        Boolean @default(true)
  steps           SequenceStep[]
  createdAt       DateTime
}

SequenceStep {
  id              UUID
  sequenceId      -> Sequence
  sortOrder       Int
  delayMinutes    Int           // 0 = immediate, 1440 = 24 hours
  channel         String        // sms, email
  subject         String?       // email only
  body            String        // supports {{firstName}}, {{vehicleInterest}}, {{salesperson}}, etc.
  createdAt       DateTime
}
```

### sequence_enrollments
Tracks which leads are in which sequences and where they are.
```
SequenceEnrollment {
  id              UUID
  leadId          -> Lead
  sequenceId      -> Sequence
  currentStep     Int @default(0)
  status          String        // active, paused, completed, cancelled
  nextFireAt      DateTime?     // when the next step should execute
  pausedReason    String?       // "lead_replied", "stage_changed", "manual"
  createdAt       DateTime

  @@index([status, nextFireAt])
}
```

### call_logs
Phone call tracking.
```
CallLog {
  id              UUID
  contactId       -> Contact
  leadId          -> Lead?
  direction       String        // inbound, outbound
  duration        Int?          // seconds
  outcome         String?       // connected, voicemail, no_answer, busy
  notes           String?
  calledById      -> User?
  createdAt       DateTime
}
```

### round_robin_state
Tracks assignment rotation.
```
RoundRobinState {
  id              UUID
  lastAssignedId  -> User       // last salesperson who got a lead
  updatedAt       DateTime
}
```

### vehicle_interests
Links contacts to vehicles they've shown interest in (for the re-engagement engine).
```
VehicleInterest {
  id              UUID
  contactId       -> Contact
  vehicleId       -> Vehicle?   // specific vehicle
  make            String?       // or general interest
  model           String?
  yearMin         Int?
  yearMax         Int?
  priceMax        Int?
  createdAt       DateTime

  @@index([make, model])
}
```

### Relationships to existing models
```
User (salesperson)  ── Lead[] (assigned leads)
Vehicle             ── Lead[] (leads interested in this vehicle)
Vehicle             ── VehicleInterest[] (broader interest tracking)
Contact             ── Lead[] (sales opportunities)
Contact             ── Conversation[] (communication threads)
Contact             ── VehicleInterest[] (what they want)
CalendarItem        ── Lead? (appointments linked to leads)
```

---

## 4. PAGE / SCREEN PLAN

| Page | Path | Purpose | Who |
|------|------|---------|-----|
| **Pipeline** | `/leads` | Kanban board of all leads by stage | Admin, Sales |
| **Lead Detail** | `/leads/[id]` | Full lead view: contact, conversation, timeline, vehicle | Admin, Sales |
| **Contacts** | `/contacts` | Searchable contact list | Admin, Sales |
| **Contact Detail** | `/contacts/[id]` | Contact profile, all leads, full conversation history | Admin, Sales |
| **Inbox** | `/inbox` | Unified conversation view (like iMessage) — all SMS + email | Admin, Sales |
| **Conversation** | `/inbox/[id]` | Single conversation thread with reply | Admin, Sales |
| **Sequences** | `/sequences` | Manage automated sequences | Admin |
| **Sequence Editor** | `/sequences/[id]` | Build/edit sequence steps | Admin |
| **New Lead** | `/leads/new` | Manual lead entry (walk-ins, phone calls) | Admin, Sales |
| **Lead Reports** | `/reports/leads` | Lead source ROI, close rates, response times, sales performance | Admin |

---

## 5. KEY SCREENS UX

### Pipeline (`/leads`)
Same kanban pattern as Recon Board but for leads:
```
| New (12) | Contacted (8) | Appt Set (3) | Showed (2) | Negotiating (1) | Sold (15) |
|----------|---------------|---------------|------------|-----------------|-----------|
| Card     | Card          | Card          | Card       | Card            | Card      |
| Card     | Card          | Card          |            |                 | Card      |
```

Each card shows:
- Contact name
- Vehicle interest (if linked)
- Lead source badge
- Time since last activity
- Assigned salesperson
- Unread message indicator

Filter bar: By salesperson, by source, by date range

### Lead Detail (`/leads/[id]`)
```
┌─────────────────────────────────────────┐
│ ← Pipeline                              │
│                                         │
│ John Smith                    [CONTACTED]│
│ (305) 555-1234 · john@email.com        │
│ Assigned: Carlos    Source: Meta Ad      │
│                                         │
│ ┌─ VEHICLE INTEREST ──────────────────┐ │
│ │ 2022 BMW M4 Competition · #A1234    │ │
│ │ In Detailing · Est. ready in 2 days │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ CONVERSATION ──────────────────────┐ │
│ │ [Auto] Thanks for your interest...  │ │
│ │ [John] Is the car available?        │ │
│ │ [Carlos] Yes! Would you like to...  │ │
│ │                                     │ │
│ │ [Type a message...]          [Send] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─ TIMELINE ──────────────────────────┐ │
│ │ Mar 20 · Lead created (Meta Ad)     │ │
│ │ Mar 20 · Auto-text sent             │ │
│ │ Mar 20 · John replied via SMS       │ │
│ │ Mar 20 · Carlos called (2min)       │ │
│ │ Mar 21 · Moved to Contacted         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Set Appointment] [Log Call] [Mark Lost]│
└─────────────────────────────────────────┘
```

### Inbox (`/inbox`)
Left: conversation list (sorted by most recent). Each row shows contact name, last message preview, timestamp, unread badge.
Right (desktop) / Full screen (mobile): active conversation thread.
Reply box at bottom with channel toggle (SMS / Email).

---

## 6. TWILIO INTEGRATION

### What we need from Twilio:
- **A phone number** — one dealership number for all SMS
- **Programmable Messaging API** — send/receive SMS
- **Webhooks** — Twilio POSTs inbound SMS to our API

### Architecture:
```
Outbound: App → /api/sms/send → Twilio API → Customer phone
Inbound:  Customer phone → Twilio → /api/webhooks/twilio → App (creates message, updates conversation)
```

### API routes needed:
- `POST /api/sms/send` — send SMS to a contact (body, contactId)
- `POST /api/webhooks/twilio` — receive inbound SMS (Twilio posts here)
- `POST /api/webhooks/twilio/status` — delivery status updates

### Environment variables:
```
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxxxx
```

### Key logic:
- When sending, look up or create conversation for that contact
- When receiving, match phone number to contact, create message, increment unread count
- If contact doesn't exist for inbound number, create a new contact + lead (source: phone_call)

---

## 7. LEAD CAPTURE WEBHOOKS

### Website form
Your website form POSTs to: `POST /api/webhooks/lead-intake`
```json
{
  "source": "website_form",
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@email.com",
  "phone": "+13055551234",
  "vehicleInterest": "2022 BMW M4",
  "message": "Is this still available?"
}
```

### Meta Lead Ads
Meta sends leads via webhook (or Zapier/Make relay) to same endpoint with `source: "meta_ad"` and optional `sourceDetail` (campaign name).

### Manual entry
Salespeople add walk-ins and phone calls via `/leads/new`.

### Intake processing:
1. Check if contact exists (by phone or email)
2. Create or update contact
3. Create lead record
4. Round robin assign to next salesperson
5. Fire matching automation sequence
6. Create notifications
7. Return lead ID

---

## 8. ROUND ROBIN LOGIC

Simple and fair:
1. Get list of active salespeople (users with role `sales`, `isActive: true`)
2. Look up `round_robin_state` → last assigned user
3. Find next salesperson in rotation after that user
4. Assign lead to them
5. Update `round_robin_state`

**Edge cases:**
- If a salesperson is marked unavailable (future: availability toggle), skip them
- If only one salesperson, they get everything
- New salespeople added to end of rotation automatically

---

## 9. AUTOMATION / SEQUENCE ENGINE

### How it works:
1. Lead enters pipeline → system checks if any sequence matches (by source or status)
2. If match, create `SequenceEnrollment` with `nextFireAt = now + step[0].delayMinutes`
3. A cron job runs every minute, finds enrollments where `nextFireAt <= now` and `status = active`
4. Executes the step (send SMS or email via Twilio/Resend)
5. Advances `currentStep`, calculates next `nextFireAt`
6. If lead replies (inbound message detected) → pause enrollment (reason: "lead_replied")
7. If lead changes pipeline stage → pause enrollment (reason: "stage_changed")
8. Completed when all steps executed

### Template variables:
```
{{firstName}} → contact first name
{{vehicleInterest}} → vehicle or interest text
{{salesperson}} → assigned salesperson name
{{dealershipName}} → "Mikalyzed Auto Boutique"
{{dealershipPhone}} → main phone number
```

### Cron job:
- Runs every 1-2 minutes
- Queries: `WHERE status = 'active' AND nextFireAt <= NOW()`
- Processes in batches
- Logs each execution

---

## 10. VEHICLE-LEAD INTELLIGENCE

This is the killer feature GHL can't do.

### When a lead is linked to a vehicle:
- Store in `vehicle_interests` table with specific vehicle + general preferences (make, model, price range)
- When lead goes Lost, the interest record persists

### When new inventory arrives:
- On vehicle creation, query `vehicle_interests` for matching make/model/price
- Surface matches: "3 previous leads were interested in similar vehicles"
- Admin can one-click send re-engagement message to those contacts
- Future: auto-enroll in a "New Similar Inventory" sequence

### Matching logic:
```sql
WHERE (vehicleId = new_vehicle.id)
   OR (make = new_vehicle.make AND model = new_vehicle.model)
   OR (make = new_vehicle.make AND priceMax >= new_vehicle.price)
```

---

## 11. REPORTING

### Lead Reports (`/reports/leads`)

**Metrics:**
- **Lead volume** — total leads by source, by week/month
- **Response time** — avg time from lead creation to first salesperson contact (by person)
- **Conversion rate** — leads → sold, by source, by salesperson
- **Pipeline velocity** — avg days in each stage
- **Lost reasons** — breakdown (price, financing, ghosted, etc.)
- **Salesperson leaderboard** — leads assigned, contacted, sold, avg response time
- **Vehicle interest** — most inquired vehicles, most popular makes/models
- **Source ROI** — once ad spend is tracked (DMS phase), cost per lead and cost per sale by source

**Dashboard cards (added to main dashboard for admin):**
- New leads today/this week
- Unresponded leads (no first contact yet)
- Appointments today
- Leads by stage (mini pipeline)

---

## 12. IMPLEMENTATION PLAN

### Phase A: Foundation (Day 1)
- Prisma schema: contacts, leads, conversations, messages, call_logs, round_robin_state, vehicle_interests
- Migration + generate
- Constants/types files
- Nav update (add Leads, Contacts, Inbox)

### Phase B: Pipeline + Lead Management (Day 1-2)
- Lead pipeline page (kanban)
- Lead detail page
- New lead form (manual entry)
- Contact list + detail pages
- Round robin assignment logic
- Lead intake webhook API
- Vehicle linking on leads

### Phase C: Twilio SMS (Day 2)
- Twilio client library
- Send SMS API route
- Receive SMS webhook
- Conversation model + inbox page
- Two-way messaging on lead detail page
- Delivery status tracking

### Phase D: Automation Engine (Day 2-3)
- Sequence model + editor page
- Sequence enrollment logic
- Cron job for step execution
- Auto-pause on reply / stage change
- Template variable substitution

### Phase E: Intelligence + Reporting (Day 3)
- Vehicle interest tracking
- Similar vehicle matching on new inventory
- Lead reports page
- Dashboard integration (new leads, unresponded, appointments)

### Phase F: Email Channel (Day 3)
- Resend integration for outbound email (already have Resend)
- Inbound email webhook (Resend or Mailgun)
- Email messages in conversations
- Email steps in sequences

---

## 13. OPINIONATED DECISIONS

### Should the CRM be a separate app or inside Mikalyzed Management?
**Inside.** One platform. Salespeople already have accounts. Leads link to vehicles. Everything connects.

### SMS from a shared number or individual numbers?
**Shared dealership number.** Simpler setup, one Twilio number. Messages show which salesperson sent them internally, but customer sees one consistent number. If Fernando wants per-salesperson numbers later, that's a Twilio config change, not an architecture change.

### Build a full email client or just send/receive?
**Just send/receive.** This isn't Gmail. It's transactional communication tied to leads. Simple thread view, reply box, done. No folders, no drafts, no attachments (for now).

### How much automation is enough?
**Linear sequences only.** No branching logic, no if/then trees, no "wait until" conditions. That's GHL bloat. Linear steps with auto-pause on reply covers 95% of dealership needs. Add complexity only when Fernando asks for it.

### Should leads and contacts be separate?
**Yes.** A contact is a person. A lead is a sales opportunity. John Smith might inquire about a BMW today (Lead 1, Lost) and come back 6 months later for a Mercedes (Lead 2). Same contact, different leads. This is how you build long-term customer relationships, not just track transactions.

---

## 14. ROUTES

### Pages
```
/leads                    Pipeline kanban
/leads/new                Manual lead entry
/leads/[id]               Lead detail + conversation + timeline
/contacts                 Contact list
/contacts/[id]            Contact profile
/inbox                    Unified inbox
/inbox/[id]               Conversation thread
/sequences                Sequence list
/sequences/new            Create sequence
/sequences/[id]           Edit sequence + steps
/reports/leads            Lead reporting
```

### API Routes
```
/api/leads                GET (list/filter), POST (create)
/api/leads/[id]           GET, PATCH, DELETE
/api/contacts             GET (list/search), POST (create)
/api/contacts/[id]        GET, PATCH
/api/conversations        GET (list)
/api/conversations/[id]   GET (messages)
/api/sms/send             POST (send SMS)
/api/email/send           POST (send email)
/api/calls/log            POST (log a call)
/api/sequences            GET, POST
/api/sequences/[id]       GET, PATCH, DELETE
/api/sequences/[id]/steps POST, PATCH, DELETE
/api/webhooks/lead-intake POST (website + Meta forms)
/api/webhooks/twilio      POST (inbound SMS)
/api/webhooks/twilio/status POST (delivery status)
/api/reports/leads        GET (metrics)
```

---

*Ready to build when you say go.*
