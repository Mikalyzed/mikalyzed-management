import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/reports/meeting/interpret — the Morning Meeting smart input.
 *
 * Turns what the admin typed on a vehicle row into a PLAN of 1–3 steps.
 * A note like "remove hood, send to Frank's next week" becomes two steps:
 * a recon task for the mechanic AND a pending external repair with an
 * expected date. Nothing is written here — the client shows every step for
 * a one-tap confirm, then executes them through the normal CRUD endpoints
 * (adding cross-links, e.g. the external's notes say it's waiting on the
 * mechanic task). The model only routes the admin's words; it never invents
 * vehicle facts.
 */

const PLAN_TOOL: Anthropic.Tool = {
  name: 'propose_plan',
  description: 'Propose the ordered list of actions (1-3 steps) that carries out the admin\'s note for this vehicle.',
  input_schema: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['recon_task', 'followup', 'part_request', 'external'],
              description:
                'recon_task = shop-floor work for the mechanic/detailer on the car\'s current stage. ' +
                'followup = an office/admin to-do or reminder (calls, titles, quotes, coordination). ' +
                'part_request = a part to source/order for the car. ' +
                'external = send the car to an outside shop/vendor.',
            },
            item: { type: 'string', description: 'recon_task only: checklist item text, e.g. "Remove hood".' },
            title: { type: 'string', description: 'followup only: short imperative title.' },
            detail: { type: 'string', description: 'followup only: extra context the admin gave. Omit if none.' },
            dueInDays: { type: 'number', description: 'followup only: only if the admin gave a timeframe ("tomorrow"=1, "next week"=7).' },
            assignToName: { type: 'string', description: 'followup only: the person the admin named to do it ("task Lenny with…" → "Lenny"). Omit if nobody was named.' },
            partName: { type: 'string', description: 'part_request only: short part name.' },
            notes: { type: 'string', description: 'part_request only: extra detail (side, spec, color). Omit if none.' },
            shopName: { type: 'string', description: 'external only: shop/vendor name if the admin said one. Omit if not mentioned.' },
            work: { type: 'string', description: 'external only: the work the outside shop will do.' },
            expectedInDays: { type: 'number', description: 'external only: only if the admin gave a timeframe for it ("next week"=7).' },
          },
          required: ['type'],
        },
      },
    },
    required: ['steps'],
  },
}

export type PlanStep = {
  type: 'recon_task' | 'followup' | 'part_request' | 'external'
  item?: string
  title?: string
  detail?: string
  dueInDays?: number
  assignToName?: string
  partName?: string
  notes?: string
  shopName?: string
  work?: string
  expectedInDays?: number
}

/** The model must never invent details — placeholder tokens get scrubbed so
 *  the client can ask the admin to fill the gap instead. */
const PLACEHOLDER = /^[<\[]?\s*(unknown|unclear|n\/?a|tbd|none|not specified|unspecified|placeholder)\s*[>\]]?$/i
function scrub(s: PlanStep): PlanStep {
  const out: PlanStep = { ...s }
  for (const k of ['item', 'title', 'detail', 'partName', 'notes', 'shopName', 'work', 'assignToName'] as const) {
    const v = out[k]
    if (typeof v === 'string' && (PLACEHOLDER.test(v.trim()) || !v.trim())) delete out[k]
  }
  return out
}

function validStep(s: PlanStep, hasStage: boolean): boolean {
  switch (s.type) {
    case 'recon_task': return hasStage && !!s.item?.trim()
    case 'followup': return !!s.title?.trim()
    case 'part_request': return !!s.partName?.trim()
    // An external step survives with either piece — the client collects
    // whatever is missing before anything is written.
    case 'external': return !!s.work?.trim() || !!s.shopName?.trim()
    default: return false
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const vehicle = typeof body.vehicle === 'string' ? body.vehicle : 'this vehicle'
  const hasStage = body.hasStage === true
  if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      tool_choice: { type: 'tool', name: 'propose_plan' },
      tools: [PLAN_TOOL],
      system:
        `You turn a car dealership admin's quick note about a specific vehicle (${vehicle}) into an ordered plan of 1-3 actions. ` +
        `Use ONLY what the admin actually wrote — never invent details, shops, parts, or dates, and never output placeholder values like <UNKNOWN>, N/A, or TBD; omit the field instead. ` +
        `${hasStage ? '' : 'This car has NO open recon stage, so recon_task is not available — use followup for work instructions. '}` +
        `Most notes are ONE step. Use multiple steps only when the note genuinely contains multiple actions. ` +
        `Classic compound: "remove hood, send to Frank's next week" = step 1 recon_task "Remove hood" (the mechanic does prep work in-house), ` +
        `step 2 external to Frank's with expectedInDays 7. ` +
        `Prep work on the car (remove/pull/take off something) before an external send = recon_task, not followup. ` +
        `Office work (calls, titles, quotes, scheduling, paperwork, or "task <person> with …") = followup — when the admin names WHO, set assignToName. Parts to buy = part_request.`,
      messages: [{ role: 'user', content: text }],
    })

    const tu = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const raw = (tu?.input as { steps?: PlanStep[] } | undefined)?.steps ?? []
    const steps = raw.map(scrub).filter(s => validStep(s, hasStage)).slice(0, 3)
    if (steps.length === 0) {
      return NextResponse.json({ error: 'Could not understand that — try rewording or use the quick buttons.' }, { status: 422 })
    }

    return NextResponse.json({ steps })
  } catch (e: any) {
    console.error('[meeting-interpret] error', e.message)
    return NextResponse.json({ error: 'AI routing failed — use the quick buttons instead.' }, { status: 500 })
  }
}
