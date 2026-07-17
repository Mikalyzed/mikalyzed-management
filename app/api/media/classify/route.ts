import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { presignGet } from '@/lib/r2'

export const runtime = 'nodejs'
export const maxDuration = 60

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Sections the classifier is allowed to assign. Anything else -> stays 'unsorted'.
const SECTIONS = ['exterior', 'interior', 'engine', 'undercarriage'] as const
type Section = (typeof SECTIONS)[number] | 'unsorted'

const MAX_PER_RUN = 80 // hard cap so one click can't run away
const CONCURRENCY = 5 // keep well under Anthropic rate limits

const SYSTEM = `You classify a single photo taken of a vehicle at a used-car dealership. Reply with EXACTLY ONE lowercase word, nothing else, chosen from:
- exterior: the outside of the car — body panels, front/rear, sides, wheels, badges, roof, overall shots taken from outside
- interior: inside the cabin — seats, dashboard, steering wheel, center console, door panels, gauges, infotainment
- engine: the engine bay / motor with the hood open
- undercarriage: the underside of the car — frame, suspension, exhaust, shot from below or on a lift
- unsure: documents, paperwork, keys, a screen/odometer close-up, blurry, or anything you cannot confidently place
Only answer with one of: exterior, interior, engine, undercarriage, unsure.`

async function classifyOne(r2Key: string, contentType: string | null): Promise<Section> {
  // Presign, fetch, downscale with sharp -> small JPEG keeps us fast, cheap, and within vision size limits.
  const url = await presignGet(r2Key, 60 * 5)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch image failed ${res.status}`)
  const input = Buffer.from(await res.arrayBuffer())
  const jpeg = await sharp(input).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer()

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
          { type: 'text', text: 'Which section?' },
        ],
      },
    ],
  })

  const raw = msg.content.find((b) => b.type === 'text')
  const word = raw && raw.type === 'text' ? raw.text.trim().toLowerCase().replace(/[^a-z]/g, '') : ''
  return (SECTIONS as readonly string[]).includes(word) ? (word as Section) : 'unsorted'
}

/**
 * POST /api/media/classify
 * Body: { vehicleId, scope?: 'unsorted' | 'all' }  (default 'unsorted')
 * Sorts the vehicle's photos into sections with AI. Confident ones are filed;
 * unsure ones are left 'unsorted' for the user to place. Videos/docs untouched.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : null
  const scope = body?.scope === 'all' ? 'all' : 'unsorted'
  if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400 })

  const typeFilter = scope === 'all'
    ? { in: ['unsorted', 'exterior', 'interior', 'engine', 'undercarriage'] }
    : 'unsorted'

  const assets = await prisma.mediaAsset.findMany({
    where: {
      vehicleId,
      type: typeFilter as any,
      OR: [{ contentType: { startsWith: 'image/' } }, { contentType: null }],
    },
    orderBy: { uploadedAt: 'asc' },
    take: MAX_PER_RUN,
    select: { id: true, r2Key: true, contentType: true },
  })

  if (assets.length === 0) {
    return NextResponse.json({ classified: 0, unsure: 0, total: 0, byType: {} })
  }

  const byType: Record<string, number> = {}
  let classified = 0
  let unsure = 0

  // Simple bounded-concurrency pool.
  let cursor = 0
  async function worker() {
    while (cursor < assets.length) {
      const a = assets[cursor++]
      try {
        const section = await classifyOne(a.r2Key, a.contentType)
        if (section !== 'unsorted') {
          await prisma.mediaAsset.update({ where: { id: a.id }, data: { type: section } })
          classified++
          byType[section] = (byType[section] ?? 0) + 1
        } else {
          // Ensure it's marked unsorted so it surfaces for manual placement.
          await prisma.mediaAsset.update({ where: { id: a.id }, data: { type: 'unsorted' } })
          unsure++
        }
      } catch {
        unsure++ // leave as-is; user can place it manually
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker))

  try {
    await prisma.activityLog.create({
      data: {
        entityType: 'vehicle',
        entityId: vehicleId,
        action: 'media_ai_sorted',
        actorId: user.id,
        details: { scope, total: assets.length, classified, unsure, byType },
      },
    })
  } catch {}

  return NextResponse.json({ classified, unsure, total: assets.length, byType })
}
