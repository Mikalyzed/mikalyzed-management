import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Smart task creation — the "+ Add Task" flow.
 *
 * mode 'propose': natural language in → AI assesses the task's execution
 *   shape (grounded in the text, never invents): simple task vs coordination
 *   (car goes to an outside shop → external + transport checkpoints). Server
 *   resolves the vehicle and assignee; ambiguity comes back as a question.
 * mode 'create': the confirmed proposal → creates the records (external
 *   drafted as Not Scheduled when there's a shop; task born linked).
 */

const ASSESS_TOOL: Anthropic.Tool = {
  name: 'assess_task',
  description: 'Structure a shop task from the admin\'s words.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short clean imperative action, e.g. "Coordinate with Willy — tow to GWT for suspension". No stock numbers.' },
      kind: { type: 'string', enum: ['coordination', 'simple'], description: 'coordination = a car/part goes to an OUTSIDE shop or needs transport arranged. simple = a direct action someone just does.' },
      stock: { type: 'string', description: 'Stock number ONLY if the text contains one (e.g. N101146).' },
      vehicleWords: { type: 'string', description: 'The words describing the car, exactly from the text (e.g. "blue 94 chevy pickup"). Omit if no car mentioned.' },
      assigneeName: { type: 'string', description: 'Person the task is assigned to, only if the text names one.' },
      shop: { type: 'string', description: 'Outside shop/vendor name EXACTLY as written, only for kind=coordination when the text names one.' },
      work: { type: 'string', description: 'What the outside shop will do, only if stated.' },
      question: {
        type: 'object',
        description: 'Ask ONLY when something critical is ambiguous in the text itself.',
        properties: {
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        },
        required: ['prompt'],
      },
    },
    required: ['title', 'kind'],
  },
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!requireRole(user.role, ['shop_coordinator'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  // ── CREATE: the human confirmed — make the records ──
  if (body.mode === 'create') {
    const c = body.proposal ?? {}
    const title = typeof c.title === 'string' ? c.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })
    const vehicle = typeof c.vehicleId === 'string' && c.vehicleId
      ? await prisma.vehicle.findUnique({ where: { id: c.vehicleId }, select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true } })
      : null

    let externalRepairId: string | null = null
    if (c.kind === 'coordination' && typeof c.shop === 'string' && c.shop.trim() && vehicle) {
      // Reuse an open external at the same shop instead of doubling up
      const existing = await prisma.externalRepair.findFirst({
        where: { stockNumber: vehicle.stockNumber, shopName: { equals: c.shop.trim(), mode: 'insensitive' }, status: { not: 'returned' } },
        select: { id: true },
      })
      if (existing) {
        externalRepairId = existing.id
      } else {
        const ext = await prisma.externalRepair.create({
          data: {
            stockNumber: vehicle.stockNumber,
            year: vehicle.year, make: vehicle.make, model: vehicle.model, color: vehicle.color,
            shopName: c.shop.trim(),
            repairDescription: typeof c.work === 'string' && c.work.trim() ? c.work.trim() : title,
            status: 'pending',
            notes: `Created from task: ${title}`,
          },
        })
        externalRepairId = ext.id
      }
    }

    const task = await prisma.task.create({
      data: {
        title: vehicle ? `${title} (#${vehicle.stockNumber})` : title,
        description: typeof c.description === 'string' ? c.description : null,
        category: 'operations',
        priority: 1,
        assigneeId: typeof c.assigneeId === 'string' && c.assigneeId ? c.assigneeId : null,
        createdById: user.id,
        stockNumbers: vehicle ? [vehicle.stockNumber] : [],
        externalRepairId,
        missionType: externalRepairId ? 'deliver' : null,
      },
    })
    await prisma.activityLog.create({
      data: {
        entityType: 'task', entityId: task.id, action: 'smart_task_created', actorId: user.id,
        details: { title, kind: c.kind, shop: c.shop ?? null, stock: vehicle?.stockNumber ?? null, linkedExternal: !!externalRepairId },
      },
    }).catch(() => {})
    return NextResponse.json({ ok: true, taskId: task.id, linkedExternal: !!externalRepairId })
  }

  // ── PROPOSE ──
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    tool_choice: { type: 'tool', name: 'assess_task' },
    tools: [ASSESS_TOOL],
    system:
      'You structure ONE dealership shop task from the admin\'s words. Use ONLY what the text says — never invent shops, people, cars, or work. ' +
      'kind=coordination when a car or part goes to an OUTSIDE shop or a tow/transport must be arranged; kind=simple for direct actions (move a car inside, clean something, call someone with no car movement). ' +
      'Ask a question ONLY for critical ambiguity in the text (e.g. two possible meanings). Title is short and clean.',
    messages: [{ role: 'user', content: text }],
  })
  const tu = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const a = (tu?.input ?? {}) as { title?: string; kind?: string; stock?: string; vehicleWords?: string; assigneeName?: string; shop?: string; work?: string; question?: { prompt?: string; options?: string[] } }

  // Vehicle resolution — stock wins; otherwise word-match the active fleet
  let vehicle: { id: string; stockNumber: string; year: number | null; make: string; model: string; color: string | null } | null = null
  let vehicleQuestion: { prompt: string; options: string[] } | null = null
  const stockInText = (a.stock ?? '').trim() || (text.match(/#?([A-Z]{1,2}\d{5,7})/i)?.[1] ?? '')
  if (stockInText) {
    vehicle = await prisma.vehicle.findFirst({
      where: { stockNumber: { equals: stockInText.toUpperCase(), mode: 'insensitive' } },
      select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true },
    })
    if (!vehicle) vehicleQuestion = { prompt: `No car found with stock ${stockInText} — which car is this for?`, options: [] }
  } else if (a.vehicleWords && a.vehicleWords.trim()) {
    const words = a.vehicleWords.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    const fleet = await prisma.vehicle.findMany({
      where: { OR: [{ inventoryStatus: null }, { inventoryStatus: { notIn: ['removed'] } }] },
      select: { id: true, stockNumber: true, year: true, make: true, model: true, color: true },
    })
    const scored = fleet
      .map(v => {
        const hay = `${v.year ?? ''} ${v.make} ${v.model} ${v.color ?? ''} ${v.stockNumber}`.toLowerCase()
        const hits = words.filter(w => hay.includes(w)).length
        return { v, hits }
      })
      .filter(x => x.hits > 0)
      .sort((x, y) => y.hits - x.hits)
    const best = scored[0]
    const runnerUp = scored[1]
    if (best && best.hits >= Math.max(2, words.length - 1) && (!runnerUp || runnerUp.hits < best.hits)) {
      vehicle = best.v
    } else if (scored.length > 0) {
      vehicleQuestion = {
        prompt: `Which car is "${a.vehicleWords}"?`,
        options: scored.slice(0, 3).map(x => `#${x.v.stockNumber} — ${x.v.year ?? ''} ${x.v.make} ${x.v.model}`.trim()),
      }
    }
  }

  // Assignee resolution — named person, else the shop coordinator
  let assignee: { id: string; name: string } | null = null
  const team = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true } })
  if (a.assigneeName && a.assigneeName.trim()) {
    const q = a.assigneeName.toLowerCase()
    assignee = team.find(u => u.name.toLowerCase().startsWith(q) || u.name.toLowerCase().includes(q)) ?? null
  }
  if (!assignee) assignee = team.find(u => u.role === 'shop_coordinator') ?? null

  return NextResponse.json({
    proposal: {
      title: (a.title ?? text.slice(0, 80)).trim(),
      kind: a.kind === 'coordination' ? 'coordination' : 'simple',
      shop: a.shop?.trim() || null,
      work: a.work?.trim() || null,
      vehicleId: vehicle?.id ?? null,
      vehicleLabel: vehicle ? `#${vehicle.stockNumber} · ${vehicle.year ?? ''} ${vehicle.make} ${vehicle.model}`.trim() : null,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
    },
    question: a.question?.prompt
      ? { prompt: a.question.prompt, options: (a.question.options ?? []).slice(0, 3) }
      : vehicleQuestion,
  })
}
