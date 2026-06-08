import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/ai/polish-description
 *
 * Body: { text: string, vehicle?: { year, make, model, trim, mileage, color } }
 * Returns: { polished: string }
 *
 * Takes the user's raw notes about a vehicle and rewrites them as a clean,
 * professional marketing description suitable for syndication to listing
 * channels (eBay Motors, Hemmings, CarsForSale, Mikalyzed retail).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'AI not configured — ANTHROPIC_API_KEY is missing on the server.' },
      { status: 503 },
    )
  }

  const body = await req.json()
  const text: string = (body?.text || '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  // Optional vehicle context — gives the model concrete facts to anchor on
  const v = body?.vehicle || {}
  const contextLines: string[] = []
  const headline = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ').trim()
  if (headline) contextLines.push(`Vehicle: ${headline}`)
  if (v.mileage) contextLines.push(`Mileage: ${Number(v.mileage).toLocaleString('en-US')} mi`)
  if (v.color) contextLines.push(`Color: ${v.color}`)
  const context = contextLines.length > 0 ? `\n\nVehicle context (use as factual reference, do not invent specs):\n${contextLines.join('\n')}` : ''

  const system =
    "You are a copywriter for a premium independent car dealership. Take the seller's raw notes and produce a clean, professional, buyer-focused marketing description suitable for syndication to eBay Motors, Hemmings, CarsForSale, and the dealer's retail website.\n\n" +
    'Rules:\n' +
    '- Keep it factual — only use details from the notes and the vehicle context provided. Never invent specs, options, history, or condition.\n' +
    '- Lead with the strongest selling point.\n' +
    '- Mention condition, recent service / records, notable options, and any included accessories when present.\n' +
    '- 150–280 words. One or two short paragraphs.\n' +
    '- No emojis. No exclamation points. No high-pressure phrases like "won\'t last long", "act fast", "don\'t miss out".\n' +
    '- Plain prose. No bullet lists, no headings, no markdown.\n' +
    '- Return ONLY the polished description text. No preamble, no commentary, no quotation marks around the output.'

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system,
      messages: [
        { role: 'user', content: `Raw notes:\n${text}${context}` },
      ],
    })

    const block = message.content[0]
    const polished = (block && block.type === 'text' ? block.text : '').trim()
    if (!polished) {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }
    return NextResponse.json({ polished })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai/polish-description] error:', msg)
    return NextResponse.json({ error: msg || 'AI request failed' }, { status: 500 })
  }
}
