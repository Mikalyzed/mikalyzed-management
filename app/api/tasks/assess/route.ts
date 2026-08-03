import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { getSessionUser, requireRole } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Resolve a relative timing phrase from the user's words ("tomorrow", "monday",
// "in 3 days") into a YYYY-MM-DD, deterministically server-side — the AI only
// pulls the phrase, it never invents the date. Noon anchor avoids TZ edges.
// Returns null when the phrase isn't a date we recognize (then we just ask).
function resolveWhen(phrase: string): string | null {
  const p = phrase.trim().toLowerCase()
  if (!p) return null
  const base = new Date()
  base.setHours(12, 0, 0, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const addDays = (n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return fmt(d) }

  if (/\b(today|tonight)\b/.test(p)) return addDays(0)
  if (/\bday after tomorrow\b/.test(p)) return addDays(2)
  if (/\b(tomorrow|tmrw|tmr|tom)\b/.test(p)) return addDays(1)
  const inN = p.match(/\bin (\d{1,2}) days?\b/) || p.match(/\b(\d{1,2}) days? from (?:now|today)\b/)
  if (inN) return addDays(parseInt(inN[1], 10))
  if (/\bnext week\b/.test(p)) return addDays(7)

  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 0; i < 7; i++) {
    const full = WEEKDAYS[i]
    if (new RegExp(`\\b(${full}|${full.slice(0, 3)})\\b`).test(p)) {
      let delta = (i - base.getDay() + 7) % 7
      if (delta === 0) delta = 7 // "monday" said on a Monday means the next one
      if (/\bnext\b/.test(p)) delta += (delta <= 6 ? 0 : 0) // "next monday" ~ same nearest
      return addDays(delta)
    }
  }
  // Explicit date the model may echo back (ISO or Date-parseable) — accept only
  // if it lands on a real day in a sane range.
  const parsed = Date.parse(phrase)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    if (d.getFullYear() >= base.getFullYear() && d.getFullYear() <= base.getFullYear() + 1) return fmt(d)
  }
  return null
}

// Turn an expected-return phrase ("~1 week", "3 days", "back friday") into a
// day count, so we can stamp the external's estimated return. Returns null when
// there's nothing to go on (then the return date stays open and gets chased).
function resolveReturnDays(phrase: string): number | null {
  const p = phrase.trim().toLowerCase()
  if (!p) return null
  if (/\b(same day|same-day|today)\b/.test(p)) return 0
  const wk = p.match(/(\d+)\s*(weeks?|wks?)\b/)
  if (wk) return parseInt(wk[1], 10) * 7
  if (/\b(a|one|1)\s*week\b/.test(p) || /\bnext week\b/.test(p)) return 7
  const dd = p.match(/(\d+)\s*(days?|d)\b/)
  if (dd) return parseInt(dd[1], 10)
  if (/\bday after tomorrow\b/.test(p)) return 2
  if (/\b(tomorrow|tmrw|tmr)\b/.test(p)) return 1
  // A weekday or explicit date the resolver understands → diff from today.
  const iso = resolveWhen(phrase)
  if (iso) {
    const base = new Date(); base.setHours(12, 0, 0, 0)
    const target = new Date(`${iso}T12:00:00`)
    const days = Math.round((target.getTime() - base.getTime()) / 86400000)
    if (days > 0 && days < 120) return days
  }
  return null
}

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
      kind: { type: 'string', enum: ['coordination', 'simple', 'part_request', 'shop_work'], description: 'coordination = a car/part goes to an OUTSIDE shop or needs transport arranged. part_request = buying/getting/ordering a PART for a car. shop_work = repair/fix/install work OUR mechanics do on the car in-house. simple = any other direct action (move a car, call someone, errands).' },
      stock: { type: 'string', description: 'Stock number ONLY if the text contains one (e.g. N101146).' },
      vehicleWords: { type: 'string', description: 'The words describing the car, exactly from the text (e.g. "blue 94 chevy pickup"). Omit if no car mentioned.' },
      assigneeName: { type: 'string', description: 'Person the task is assigned to, only if the text names one.' },
      shop: { type: 'string', description: 'Outside shop/vendor name EXACTLY as written, only for kind=coordination when the text names one.' },
      work: { type: 'string', description: 'What the outside shop will do, only if stated.' },
      whenText: { type: 'string', description: 'For kind=coordination: the timing phrase for the pickup/tow EXACTLY as written, if any (e.g. "tomorrow", "monday", "in 3 days"). Omit if no timing is stated.' },
      returnText: { type: 'string', description: 'For kind=coordination: when the car/part is expected BACK from the shop, EXACTLY as written, if stated (e.g. "back friday", "ready in 3 days", "1 week", "same day", "5 days"). Omit if not stated.' },
      partName: { type: 'string', description: 'Only for kind=part_request: the part to get, cleanly named (e.g. "New radio").' },
      installVenue: { type: 'string', enum: ['external', 'inhouse'], description: 'Only for kind=part_request when the text ALSO says the part will be INSTALLED after we get it. external = an OUTSIDE shop/vendor/garage installs it (a place name is given, e.g. "install at garage 27"). inhouse = OUR mechanics install it. OMIT this if no install is mentioned, or if install is mentioned but WHO installs it is unclear (then ask a question instead).' },
      installShop: { type: 'string', description: 'Only when installVenue=external: the outside shop/vendor that will install the part, exactly as written (e.g. "Garage 27").' },
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

    // LEARN: the human confirmed this shape (including any tap-choice answers) —
    // save the ORIGINAL wording → the confirmed shape so future classifies of
    // similar phrasings get it right without re-asking. Keyed on sourceText (the
    // first thing typed), so answers fold into the lesson, not the phrasing.
    const sourceText = typeof body.sourceText === 'string' && body.sourceText.trim() ? body.sourceText.trim() : ''
    if (sourceText) {
      await prisma.taskAssessExample.create({
        data: {
          text: sourceText.slice(0, 500),
          result: {
            kind: c.kind ?? null, shop: c.shop ?? null, work: c.work ?? null,
            partName: c.partName ?? null, installVenue: c.installVenue ?? null, installShop: c.installShop ?? null,
            whenText: c.pickupWhen ?? null, returnText: c.returnWhen ?? null,
          },
          createdById: user.id,
        },
      }).catch(() => {})
    }

    // Parsed return timing for the external (car/part expected back; 0 = same day).
    const expectedReturnDate = typeof c.expectedReturn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.expectedReturn) ? new Date(`${c.expectedReturn}T12:00:00`) : null
    const estimatedDays = typeof c.returnDays === 'number' && c.returnDays >= 0 ? Math.round(c.returnDays) : null

    // A part is not a to-do — it enters the PARTS PIPELINE (source → approve →
    // order → track → receive → install task) where all the machinery lives.
    if (c.kind === 'part_request') {
      if (!vehicle) return NextResponse.json({ error: 'Part requests need a car — say which vehicle it is for.' }, { status: 400 })
      const partName = typeof c.partName === 'string' && c.partName.trim() ? c.partName.trim() : title
      // Install plan captured at request time. 'external' means an outside vendor
      // installs it once it lands — we stamp it on the part and stand up a gated
      // mission below so it's visible now and goes live on receive.
      const installVenue = c.installVenue === 'external' || c.installVenue === 'inhouse' ? c.installVenue : null
      const installShop = installVenue === 'external' && typeof c.installShop === 'string' && c.installShop.trim() ? c.installShop.trim() : null
      const part = await prisma.part.create({
        data: {
          vehicleId: vehicle.id,
          name: partName,
          status: 'requested',
          requestedById: user.id,
          assignedToId: typeof c.assigneeId === 'string' && c.assigneeId ? c.assigneeId : null,
          installVenue,
          installShop,
        },
      })
      await prisma.activityLog.create({
        data: {
          entityType: 'part', entityId: part.id, action: 'part_created', actorId: user.id,
          details: { partName, status: 'requested', stockNumber: vehicle.stockNumber, via: 'smart_add_task', installVenue, installShop },
        },
      }).catch(() => {})

      // External install: create the mission NOW, gated on the part. It sits as a
      // pending, part-only external ("Waiting for the part") — visible for oversight
      // but it must NOT flip the car off the lot (partOnly + pending both enforce that).
      // The parts-received flow clears blockedOnPartId and the mission goes live.
      let externalRepairId: string | null = null
      if (installVenue === 'external' && installShop) {
        const ext = await prisma.externalRepair.create({
          data: {
            stockNumber: vehicle.stockNumber,
            year: vehicle.year, make: vehicle.make, model: vehicle.model, color: vehicle.color,
            shopName: installShop,
            partOnly: true,
            repairDescription: `Install: ${partName}`,
            status: 'pending',
            blockedOnPartId: part.id,
            notes: `Waiting for part to arrive — "${partName}". Goes live once the part is received.`,
            createdById: user.id,
          },
        })
        externalRepairId = ext.id
        await prisma.activityLog.create({
          data: {
            entityType: 'external_repair', entityId: ext.id, action: 'external_created', actorId: user.id,
            details: { shop: installShop, partName, stockNumber: vehicle.stockNumber, gatedOnPart: part.id, via: 'smart_add_task' },
          },
        }).catch(() => {})
      }
      return NextResponse.json({ ok: true, partId: part.id, kind: 'part_request', stock: vehicle.stockNumber, externalRepairId, installVenue, installShop })
    }

    // In-house repair work belongs on the car's MECHANIC CHECKLIST, where the
    // mechanic/hours/inspection machinery lives — not on a to-do list.
    if (c.kind === 'shop_work') {
      if (!vehicle) return NextResponse.json({ error: 'Shop work needs a car — say which vehicle it is on.' }, { status: 400 })
      const activeStage = await prisma.vehicleStage.findFirst({
        where: { vehicleId: vehicle.id, status: { in: ['pending', 'in_progress'] } },
        orderBy: { startedAt: 'desc' },
        select: { id: true, stage: true, checklist: true },
      })
      if (activeStage && activeStage.stage === 'mechanic') {
        const existing = Array.isArray(activeStage.checklist) ? activeStage.checklist as Array<Record<string, unknown>> : []
        const have = existing.some(x => String(x?.item ?? '').trim().toLowerCase() === title.toLowerCase())
        if (!have) {
          await prisma.vehicleStage.update({
            where: { id: activeStage.id },
            data: { checklist: [...existing, { item: title, done: false, note: '', addedByMechanic: true, approved: 'approved', assigneeId: null, assigneeName: null }] as object[] },
          })
        }
        await prisma.activityLog.create({
          data: {
            entityType: 'vehicle', entityId: vehicle.id, action: 'task_added_to_checklist', actorId: user.id,
            details: { item: title, stage: 'mechanic', via: 'smart_add_task' },
          },
        }).catch(() => {})
        return NextResponse.json({ ok: true, kind: 'shop_work', placed: 'mechanic_checklist', stock: vehicle.stockNumber })
      }
      // Car isn't in mechanic — a coordinator task carries the work until it
      // can be routed there (the checklist item gets added at routing).
      const task = await prisma.task.create({
        data: {
          title: `${title} (#${vehicle.stockNumber})`,
          description: 'Shop work — the car is not in mechanic right now. Route it into mechanic and add this to the checklist (routing pre-fills carry-over tasks).',
          category: 'operations', priority: 1,
          assigneeId: typeof c.assigneeId === 'string' && c.assigneeId ? c.assigneeId : null,
          createdById: user.id,
          stockNumbers: [vehicle.stockNumber],
        },
      })
      return NextResponse.json({ ok: true, kind: 'shop_work', placed: 'task', taskId: task.id, stock: vehicle.stockNumber })
    }

    // A caught pickup date rides onto the task (pre-fills the tow) AND the
    // external's planned send date — the tow and the drop-off happen the same
    // day (our shops are close), so they move hand in hand.
    const pickupDate = typeof c.pickupDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.pickupDate) ? new Date(`${c.pickupDate}T12:00:00`) : null

    let externalRepairId: string | null = null
    if (c.kind === 'coordination' && typeof c.shop === 'string' && c.shop.trim() && vehicle) {
      // Reuse an open external at the same shop instead of doubling up
      const existing = await prisma.externalRepair.findFirst({
        where: { stockNumber: vehicle.stockNumber, shopName: { equals: c.shop.trim(), mode: 'insensitive' }, status: { not: 'returned' } },
        select: { id: true },
      })
      if (existing) {
        externalRepairId = existing.id
        // Carry the caught dates onto the existing external if it has none yet.
        if (pickupDate || expectedReturnDate || estimatedDays != null) {
          await prisma.externalRepair.update({
            where: { id: existing.id },
            data: {
              ...(pickupDate ? { plannedSendDate: pickupDate } : {}),
              ...(expectedReturnDate ? { expectedReturn: expectedReturnDate } : {}),
              ...(estimatedDays != null ? { estimatedDays } : {}),
            },
          }).catch(() => {})
        }
      } else {
        const ext = await prisma.externalRepair.create({
          data: {
            stockNumber: vehicle.stockNumber,
            year: vehicle.year, make: vehicle.make, model: vehicle.model, color: vehicle.color,
            shopName: c.shop.trim(),
            repairDescription: typeof c.work === 'string' && c.work.trim() ? c.work.trim() : title,
            status: 'pending',
            plannedSendDate: pickupDate,
            expectedReturn: expectedReturnDate,
            estimatedDays,
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
        scheduledDate: pickupDate,
      },
    })
    await prisma.activityLog.create({
      data: {
        entityType: 'task', entityId: task.id, action: 'smart_task_created', actorId: user.id,
        details: { title, kind: c.kind, shop: c.shop ?? null, stock: vehicle?.stockNumber ?? null, linkedExternal: !!externalRepairId },
      },
    }).catch(() => {})
    return NextResponse.json({ ok: true, taskId: task.id, externalRepairId, stock: vehicle?.stockNumber ?? null })
  }

  // ── PROPOSE ──
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'Text required' }, { status: 400 })

  // Learn-as-you-use: confirmed proposals (and the answers to tap-choice
  // questions) replay as few-shot so the assistant catches on to this shop's
  // phrasings and stops re-asking what it's already been told.
  const examples = await prisma.taskAssessExample.findMany({
    orderBy: { createdAt: 'desc' }, take: 12, select: { text: true, result: true },
  }).catch(() => [] as Array<{ text: string; result: unknown }>)
  const exampleBlock = examples.length
    ? '\n\nConfirmed examples from THIS dealership (match their wording and shapes):\n' +
      examples.map(e => `"${e.text}" -> ${JSON.stringify(e.result)}`).join('\n')
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    tool_choice: { type: 'tool', name: 'assess_task' },
    tools: [ASSESS_TOOL],
    system:
      'You structure ONE dealership shop task from the admin\'s words. Use ONLY what the text says — never invent shops, people, cars, or work. ' +
      'kind=coordination when a car or part goes to an OUTSIDE shop or a tow/transport must be arranged; kind=part_request when someone needs to BUY/GET/ORDER a part for a car; kind=shop_work when OUR mechanics fix/repair/install something on the car in-house; kind=simple for other direct actions (move a car inside, call someone). ' +
      'A part_request can ALSO mention installing the part once it arrives. If a place/shop/garage name is given for the install (e.g. "install at garage 27"), set installVenue=external and installShop to that name — it stays kind=part_request. If the text says WE/our mechanics install it, set installVenue=inhouse. If install is mentioned but WHO installs it is unclear, OMIT installVenue and ASK a question with options like the shop name (outside), "Our shop", and "Just the part for now". ' +
      'For coordination, if the text says WHEN the pickup/tow happens (e.g. "tomorrow", "monday"), put that phrase verbatim in whenText. If it says when it comes BACK (e.g. "back friday", "ready in 3 days"), put that verbatim in returnText. Do not resolve either to a date yourself. ' +
      'When you are NOT confident — the shape, the install venue, the shop, or whether there is a second action — prefer to ASK with a short question and 2-3 tap options rather than guessing. That is how you learn this shop. ' +
      'Title is short and clean.' +
      exampleBlock,
    messages: [{ role: 'user', content: text }],
  })
  const tu = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const a = (tu?.input ?? {}) as { title?: string; kind?: string; stock?: string; vehicleWords?: string; assigneeName?: string; shop?: string; work?: string; partName?: string; installVenue?: string; installShop?: string; whenText?: string; returnText?: string; question?: { prompt?: string; options?: string[] } }

  // Resolve a caught pickup-timing phrase to a real date, server-side.
  const pickupWhen = a.kind === 'coordination' && a.whenText?.trim() ? a.whenText.trim() : null
  const pickupDate = pickupWhen ? resolveWhen(pickupWhen) : null
  // Resolve an expected-return phrase → days + a return date (relative to the
  // pickup day when we have one, else today).
  const returnWhen = a.kind === 'coordination' && a.returnText?.trim() ? a.returnText.trim() : null
  const returnDays = returnWhen ? resolveReturnDays(returnWhen) : null
  let expectedReturn: string | null = null
  if (returnDays != null) {
    const baseDay = pickupDate ? new Date(`${pickupDate}T12:00:00`) : (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d })()
    baseDay.setDate(baseDay.getDate() + returnDays)
    expectedReturn = `${baseDay.getFullYear()}-${String(baseDay.getMonth() + 1).padStart(2, '0')}-${String(baseDay.getDate()).padStart(2, '0')}`
  }

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

  // Assignee resolution — named person, else the person ADDING the task (so it
  // lands on their own Assignments, which filter strictly by assigneeId). Falls
  // back to the shop coordinator only if the actor somehow isn't in the team.
  let assignee: { id: string; name: string } | null = null
  const team = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true } })
  if (a.assigneeName && a.assigneeName.trim()) {
    const q = a.assigneeName.toLowerCase()
    assignee = team.find(u => u.name.toLowerCase().startsWith(q) || u.name.toLowerCase().includes(q)) ?? null
  }
  if (!assignee) {
    assignee = team.find(u => u.id === user.id)
      ?? team.find(u => u.role === 'shop_coordinator')
      ?? null
  }

  let mechanicActive = false
  if (vehicle && a.kind === 'shop_work') {
    const st = await prisma.vehicleStage.findFirst({
      where: { vehicleId: vehicle.id, status: { in: ['pending', 'in_progress'] } },
      orderBy: { startedAt: 'desc' },
      select: { stage: true },
    })
    mechanicActive = st?.stage === 'mechanic'
  }

  return NextResponse.json({
    proposal: {
      mechanicActive,
      title: (a.title ?? text.slice(0, 80)).trim(),
      kind: a.kind === 'coordination' ? 'coordination' : a.kind === 'part_request' ? 'part_request' : a.kind === 'shop_work' ? 'shop_work' : 'simple',
      partName: a.kind === 'part_request' ? (a.partName?.trim() || null) : null,
      // A part that must be installed at an OUTSIDE vendor once it arrives — the
      // create step spins up a gated ExternalRepair mission that goes live on receive.
      installVenue: a.kind === 'part_request' && (a.installVenue === 'external' || a.installVenue === 'inhouse') ? a.installVenue : null,
      installShop: a.kind === 'part_request' && a.installVenue === 'external' ? (a.installShop?.trim() || null) : null,
      shop: a.shop?.trim() || null,
      work: a.work?.trim() || null,
      // Caught pickup timing — pre-fills the tow date (confirm-first: the user
      // still taps Schedule). pickupWhen is the raw phrase, for the preview.
      pickupWhen: pickupWhen,
      pickupDate: pickupDate,
      // Expected-back timing → stamps the external's estimated return.
      returnWhen: returnWhen,
      expectedReturn: expectedReturn,
      returnDays: returnDays,
      vehicleId: vehicle?.id ?? null,
      vehicleLabel: vehicle ? `#${vehicle.stockNumber} · ${vehicle.year ?? ''} ${vehicle.make} ${vehicle.model}`.trim() : null,
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
    },
    // Question priority: the AI's own ambiguity Q, then a car pick, then — for a
    // coordination with no return timing yet — ask when it's expected back
    // (once only: suppressed after any answer round-trip so it never loops).
    question: a.question?.prompt
      ? { prompt: a.question.prompt, options: (a.question.options ?? []).slice(0, 3) }
      : vehicleQuestion
      ?? ((a.kind === 'coordination' && vehicle && !returnWhen && !/answer:/i.test(text))
          ? { prompt: `When's it expected back from ${a.shop?.trim() || 'the shop'}?`, options: ['Same day', 'Not sure yet'], input: 'days' as const }
          : null),
  })
}
