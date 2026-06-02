# External Integrations

**Analysis Date:** 2026-06-02

## APIs & External Services

**Messaging & Communication:**
- Twilio SMS/MMS - Send and receive text messages
  - SDK: `twilio` 5.13.1
  - Auth: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
  - Endpoints: `app/api/sms/send/route.ts`, `app/api/sms/webhook/route.ts`
  - Features: Per-user phone numbers, media URL support, webhook signature validation

- Twilio Voice - Call handling, recording, transcription, IVR
  - SDK: `@twilio/voice-sdk` 2.18.2 (browser)
  - Auth: Same Twilio credentials
  - Endpoints: `app/api/voice/token/route.ts`, `app/api/voice/incoming/route.ts`, `app/api/voice/call-status/route.ts`, `app/api/voice/transcription/route.ts`, `app/api/voice/voicemail/route.ts`, `app/api/voice/recording-status/route.ts`, `app/api/voice/twiml/route.ts`
  - Features: Call recording, voicemail, TwiML generation, webhook validation

- Meta (Instagram/Messenger) - DM inbox integration
  - Auth: `META_VERIFY_TOKEN`, `META_APP_SECRET`
  - Endpoints: `app/api/instagram/webhook/route.ts`, `app/api/instagram/send/route.ts`
  - Webhook validation: X-Hub-Signature-256 HMAC-SHA256
  - Capabilities: Receive DM events, send outbound messages, webhook handshake

**Email:**
- Resend - Email delivery
  - SDK: `resend` 6.9.4
  - Auth: `RESEND_API_KEY`
  - Implementation: `lib/email.ts`
  - From: `Mikalyzed Auto Boutique <management@mikalyzedautoboutique.com>`

- Microsoft Graph API (Outlook) - Per-user email sending, inbox mirror
  - Auth: Azure client credentials (app-level)
    - `AZURE_CLIENT_ID`
    - `AZURE_TENANT_ID`
    - `AZURE_CLIENT_SECRET`
  - Endpoint: `https://graph.microsoft.com/v1.0`
  - Implementation: `lib/graph.ts` with in-process token caching
  - Features: Send as user (`sendMail`), list inbox messages, subscription webhooks, access control checks

**AI & Automation:**
- Anthropic Claude API - Listing parsing, inventory Q&A
  - SDK: `@anthropic-ai/sdk` 0.86.1
  - Auth: `ANTHROPIC_API_KEY`
  - Model: claude-3-haiku-20240307
  - Endpoints: `app/api/fetch-listing/route.ts`, `app/api/generate-ad/route.ts`, `app/api/inventory/ask/route.ts`
  - Use cases: Parse vehicle listings via web scraping, generate ad copy, answer inventory questions

- Hugging Face Transformers (local) - Client-side ML
  - Package: `@xenova/transformers` 2.17.2
  - No external API; runs in-browser or on server
  - For embeddings/similarity tasks (inspect usage in codebase)

## Data Storage

**Databases:**
- PostgreSQL
  - Connection: `DATABASE_URL` env var
  - Client: `@prisma/client` 6.19.2 (Prisma ORM)
  - Schema: `prisma/schema.prisma`
  - Features: User roles, vehicles, stages, opportunities, messages, tasks, contacts, events, parts, calendar items, notifications, activity logs

- Supabase (PostgreSQL hosting + storage)
  - SDK: `@supabase/supabase-js` 2.102.1
  - Auth: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Implementation: `lib/supabase.ts`
  - Purpose: Data persistence, potentially auth (though custom auth via cookies used in code)

**File Storage:**
- Cloudflare R2 (S3-compatible object storage)
  - SDK: `@aws-sdk/client-s3` 3.1045.0, `@aws-sdk/s3-request-presigner` 3.1045.0
  - Auth: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  - Endpoint: `https://{accountId}.r2.cloudflarestorage.com`
  - Implementation: `lib/r2.ts`
  - Features: Presigned upload/download URLs (1-hour default), multipart upload for large files

- Cloudinary (image/video delivery)
  - SDK: `cloudinary` 2.10.0
  - Auth: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - Implementation: `lib/cloudinary.ts`
  - Features: Upload buffers (SMS/MMS media), auto-format delivery (f_auto/q_auto), image trimming, video support

**Caching:**
- In-process (Graph API token caching)
  - Location: `lib/graph.ts` (`cachedToken` variable)
  - Duration: Until 60 seconds before expiry
  - No external cache layer

## Authentication & Identity

**Current Auth:**
- Custom session via cookies
  - Session identifier: `mm_user_id` cookie
  - Implementation: `lib/auth.ts`
  - Fallback: Auto-create admin user on first run
  - Auth method: Clerk ID stored in database (clerkId field exists in User schema but not actively used)

**Legacy References:**
- Clerk referenced in Prisma schema (User.clerkId field) but not imported/configured in codebase
- Azure Entra ID configured for Graph API app-level authentication (not user auth)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, etc.)

**Logging:**
- Console-based (`console.log`, `console.warn`, `console.error`)
- Debug logging in Twilio webhook handlers
- Debug logging in Instagram webhook handlers

## CI/CD & Deployment

**Hosting:**
- Vercel (current production)
  - Server URL: `https://mikalyzed-management.vercel.app` (in Capacitor config)
  - Supports server actions and API routes
  - Build command: `prisma generate && next build`

**CI Pipeline:**
- None detected (no GitHub Actions, CircleCI, etc.)

**Mobile Publishing:**
- TestFlight (Apple)
  - Bundle ID: `com.mikalyzed.mgmt`
  - Build configuration: `capacitor.config.ts`
  - Server URL toggle: `CAP_ENV=dev` (localhost) vs `CAP_ENV=prod` (Vercel)

## Environment Configuration

**Required env vars:**
- Database: `DATABASE_URL`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- Meta/Instagram: `META_VERIFY_TOKEN`, `META_APP_SECRET`
- Azure/Graph: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`
- Anthropic: `ANTHROPIC_API_KEY`
- Resend: `RESEND_API_KEY`
- Cloudinary: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- R2/Cloudflare: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- Node env: `NODE_ENV`
- Capacitor: `CAP_ENV` (dev/prod toggle)

**Secrets location:**
- `.env` file (local development, not committed)
- Vercel environment variables (production)

## Webhooks & Callbacks

**Incoming:**
- Instagram/Meta DMs: `POST /api/instagram/webhook`
  - Triggers: New DMs, message updates
  - Validation: X-Hub-Signature-256, hub.verify_token handshake

- Twilio SMS: `POST /api/sms/webhook`
  - Triggers: Incoming SMS/MMS
  - Validation: X-Twilio-Signature header

- Twilio Voice:
  - Call status: `POST /api/voice/call-status`
  - Incoming call: `POST /api/voice/incoming`
  - Call recording: `POST /api/voice/recording-status`
  - Voicemail: `POST /api/voice/voicemail`
  - Transcription: `POST /api/voice/transcription`
  - Voicemail fallback: `POST /api/voice/voicemail-fallback`
  - Validation: `verifyTwilioRequest()` checks X-Twilio-Signature

- Microsoft Graph subscriptions: Email inbox change notifications
  - Webhook: TBD (subscription URL must be configured in Graph)
  - Types: Inbox message created/updated

**Outgoing:**
- SMS/MMS via Twilio: `sendSMS()` in `lib/twilio.ts`
- Voice calls via Twilio: TwiML generation at `app/api/voice/twiml/route.ts`
- Email via Resend: `sendNotificationEmail()` in `lib/email.ts`
- Email via Graph/Outlook: `sendMail()` in `lib/graph.ts`
- Instagram DMs: `app/api/instagram/send/route.ts`
- Media uploads: Cloudinary (`uploadBufferToCloudinary()`), R2 (`presignUpload()`)

---

*Integration audit: 2026-06-02*
