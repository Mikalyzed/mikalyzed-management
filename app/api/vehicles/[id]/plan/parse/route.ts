import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSessionUser, requireRole } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/vehicles/:id/plan/parse — turn a pasted master sheet (any format:
 * PDF text, notes, bullet lists) into a structured game plan. Nothing is
 * saved: the client shows the parsed steps for review, then POSTs them to
 * the plan endpoint. The model only structures the admin's own words.
 */

const PLAN_TOOL: Anthropic.Tool = {
  name: 'structure_plan',
  description: 'Structure the vehicle master plan into an ordered list of actionable steps.',
  input_schema: {
    type: 'object',
    properties: {
      goal: { type: 'string', description: 'The end goal in one sentence, taken from the text. Omit if not stated.' },
      steps: {
        type: 'array',
        maxItems: 25,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short actionable step title, imperative, e.g. "Take to Reds for wheel fitment measurements".' },
            detail: { type: 'string', description: 'Sub-points or extra context for this step, if the text had any. Omit otherwise.' },
            kind: {
              type: 'string',
              enum: ['generic', 'task', 'external'],
              description: 'task = shop work done in-house by our team (mechanical work, detailing, photos/content). external = work done by an OUTSIDE shop/vendor that the text NAMES. generic = everything else (measurements, ordering, listing, decisions).',
            },
            stage: {
              type: 'string',
              enum: ['mechanic', 'detailing', 'content'],
              description: 'Only for kind=task: which in-house team does it. mechanic = mechanical/repair work, detailing = cleaning/detail/paint correction, content = photos/video/marketing.',
            },
            shop: { type: 'string', description: 'Only for kind=external: the outside shop/vendor name EXACTLY as the text names it (e.g. "Nunez"). Omit if the text names no shop.' },
          },
          required: ['title'],
        },
      },
    },
    required: ['steps'],
  },
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await params

  const body = await req.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      tool_choice: { type: 'tool', name: 'structure_plan' },
      tools: [PLAN_TOOL],
      system:
        'You structure a car dealership\'s vehicle master plan into ordered actionable steps. ' +
        'Use ONLY what the text says — never invent steps, shops, or specs. ' +
        'Keep the original order of the "next steps". Items under a "current status" heading describe work ALREADY IN MOTION — ' +
        'fold each into the step that finishes it (e.g. "interior is at Nunez being redone" + "finish interior installation" = one step) rather than duplicating. ' +
        'Sub-bullets of a step go into its detail field. ' +
        'Classify each step: kind=external ONLY when the text names an outside shop/vendor doing the work (set shop to that name); ' +
        'kind=task for in-house shop work (stage: mechanic for mechanical, detailing for cleaning/detail, content for photos/video); ' +
        'kind=generic for everything else. Never invent a shop name.',
      messages: [{ role: 'user', content: text }],
    })
    const tu = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const input = tu?.input as { goal?: string; steps?: Array<{ title?: string; detail?: string; kind?: string; stage?: string; shop?: string }> } | undefined
    const steps = (input?.steps ?? [])
      .map(s => {
        const kind = s.kind === 'task' || s.kind === 'external' ? s.kind : 'generic'
        const stage = kind === 'task' && ['mechanic', 'detailing', 'content'].includes(s.stage ?? '') ? s.stage : undefined
        const shop = kind === 'external' ? (s.shop ?? '').trim() || undefined : undefined
        return {
          title: (s.title ?? '').trim(),
          detail: (s.detail ?? '').trim() || undefined,
          // A task with no stage or an external with no shop can't act — demote to generic
          kind: (kind === 'task' && !stage) || (kind === 'external' && !shop) ? 'generic' : kind,
          stage, shop,
        }
      })
      .filter(s => s.title)
      .slice(0, 25)
    if (steps.length === 0) return NextResponse.json({ error: 'Could not find steps in that text.' }, { status: 422 })
    return NextResponse.json({ goal: input?.goal?.trim() || null, steps })
  } catch (e) {
    console.error('[plan-parse] error', e)
    return NextResponse.json({ error: 'Could not parse the plan — try cleaning up the text.' }, { status: 500 })
  }
}
