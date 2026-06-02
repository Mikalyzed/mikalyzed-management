# Technology Stack

**Analysis Date:** 2026-06-02

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code, type-safe development
- JavaScript (compiled from TS) - Runtime execution
- HTML/CSS - UI rendering via React + Tailwind

**Secondary:**
- SQL (PostgreSQL) - Database queries via Prisma ORM

## Runtime

**Environment:**
- Node.js 23.9.0
- Browser (iOS WebView via Capacitor)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 15.5.13 - Full-stack React framework with server actions, API routes, static generation
- React 18.3.1 - UI component library
- Prisma 6.19.2 - ORM for PostgreSQL database access

**Mobile:**
- Capacitor 8.3.4 - Native iOS bridge
  - `@capacitor/core` 8.3.4
  - `@capacitor/ios` 8.3.4
  - `@capacitor/app`, `@capacitor/keyboard`, `@capacitor/network`, `@capacitor/preferences`, `@capacitor/push-notifications`, `@capacitor/splash-screen`, `@capacitor/status-bar`

**Styling:**
- Tailwind CSS 4.2.1 - Utility-first CSS framework
- PostCSS 8.5.8 - CSS transformation via `@tailwindcss/postcss` 4.2.1

**Type Checking:**
- TypeScript 5.9.3 - Strict mode enabled, module resolution: bundler
- `@types/node` 25.5.0
- `@types/react` 18.3.28

## Key Dependencies

**Critical:**
- `@prisma/client` 6.19.2 - Database ORM client
- `@supabase/supabase-js` 2.102.1 - Supabase storage/auth backend
- `twilio` 5.13.1 - SMS/voice/messaging via Twilio API
- `@anthropic-ai/sdk` 0.86.1 - Claude AI integration for listings, inventory Q&A
- `resend` 6.9.4 - Email delivery service

**Infrastructure:**
- `@aws-sdk/client-s3` 3.1045.0 - S3 client
- `@aws-sdk/s3-request-presigner` 3.1045.0 - Presigned URL generation for S3
- `cloudinary` 2.10.0 - Image/video delivery and transformation
- `dotenv` 17.3.1 - Environment variable loading

**Media & Processing:**
- `sharp` 0.34.5 - Image processing (resizing, format conversion)
- `canvas` 3.2.3 - Canvas rendering for vehicle photos
- `cheerio` 1.2.0 - HTML parsing (web scraping listings)
- `@xenova/transformers` 2.17.2 - Local AI embeddings/ML models

**Voice:**
- `@twilio/voice-sdk` 2.18.2 - Twilio Voice SDK for call handling

## Configuration

**Environment:**
- `.env` file present (contains secrets — not read)
- Build-time env vars: `NEXT_PUBLIC_*` prefixed for browser access
- Runtime-only env vars: Backend secrets (API keys, database URLs)

**Build:**
- `tsconfig.json` - TypeScript configuration with strict mode, path aliases (`@/*` → root)
- `next.config.ts` - Next.js config: server action body size limit 20MB
- `capacitor.config.ts` - Capacitor iOS config with dev/prod URL toggling via `CAP_ENV` env var

**Styling:**
- `tailwind.config.ts` - Custom brand color palette (blue theme: 50-900)
- `postcss.config.mjs` - PostCSS plugins configuration

## Platform Requirements

**Development:**
- Node.js 23.9.0+
- npm for dependency management
- Xcode (for iOS build via Capacitor)
- `.env` file with required secrets

**Production:**
- Vercel (current deployment target)
- iOS via TestFlight (bundle ID: `com.mikalyzed.mgmt`)
- PostgreSQL database (Prisma datasource)
- Cloudflare R2 or AWS S3 for file storage
- Supabase for data/auth backend
- Twilio for SMS/voice
- Resend for email
- Anthropic API for AI features
- Cloudinary for media delivery

---

*Stack analysis: 2026-06-02*
