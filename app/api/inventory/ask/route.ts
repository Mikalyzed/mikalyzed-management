import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type VehicleRow = {
  stockNumber: string
  vehicleInfo: string
  year: number | null
  make: string
  model: string
  color: string | null
  mileage: number | null
  location: string | null
  askingPrice: number | null
  vehicleCost: number | null
  purchaseType: string | null
  purchasedFrom: string | null
  titleStatus: string | null
  dateInStock: Date | null
  status: string
}

type Filter = {
  purchase_types?: string[]
  statuses?: string[]
  year_min?: number
  year_max?: number
  mileage_min?: number
  mileage_max?: number
  asking_price_min?: number
  asking_price_max?: number
  cost_min?: number
  cost_max?: number
  makes?: string[]
  models?: string[]
  colors?: string[]
  title_statuses?: string[]
  purchased_from?: string[]
  days_in_stock_min?: number
  days_in_stock_max?: number
  text_match?: string
  sort_by?: 'dateInStock' | 'mileage' | 'year' | 'askingPrice' | 'vehicleCost'
  sort_dir?: 'asc' | 'desc'
  limit?: number
  return_mode?: 'count_only' | 'list' | 'count_and_list'
}

function applyFilter(vehicles: VehicleRow[], f: Filter) {
  const now = Date.now()
  const norm = (s: string) => s.trim().toUpperCase()

  let result = vehicles.filter(v => {
    if (f.purchase_types?.length) {
      const t = (v.purchaseType || '').trim().toUpperCase()
      if (!f.purchase_types.map(norm).includes(t)) return false
    }
    if (f.statuses?.length && !f.statuses.includes(v.status)) return false
    if (f.year_min != null && (v.year == null || v.year < f.year_min)) return false
    if (f.year_max != null && (v.year == null || v.year > f.year_max)) return false
    if (f.mileage_min != null && (v.mileage == null || v.mileage < f.mileage_min)) return false
    if (f.mileage_max != null && (v.mileage == null || v.mileage > f.mileage_max)) return false
    if (f.asking_price_min != null && (v.askingPrice == null || v.askingPrice < f.asking_price_min)) return false
    if (f.asking_price_max != null && (v.askingPrice == null || v.askingPrice > f.asking_price_max)) return false
    if (f.cost_min != null && (v.vehicleCost == null || v.vehicleCost < f.cost_min)) return false
    if (f.cost_max != null && (v.vehicleCost == null || v.vehicleCost > f.cost_max)) return false
    if (f.makes?.length) {
      const m = (v.make || '').trim().toUpperCase()
      if (!f.makes.map(norm).some(x => m.includes(x))) return false
    }
    if (f.models?.length) {
      const m = (v.model || '').trim().toUpperCase()
      if (!f.models.map(norm).some(x => m.includes(x))) return false
    }
    if (f.colors?.length) {
      const c = (v.color || '').trim().toUpperCase()
      if (!f.colors.map(norm).some(x => c.includes(x))) return false
    }
    if (f.title_statuses?.length) {
      const t = (v.titleStatus || '').trim().toUpperCase()
      if (!f.title_statuses.map(norm).includes(t)) return false
    }
    if (f.purchased_from?.length) {
      const p = (v.purchasedFrom || '').trim().toUpperCase()
      if (!f.purchased_from.map(norm).some(x => p.includes(x))) return false
    }
    if (f.days_in_stock_min != null || f.days_in_stock_max != null) {
      if (!v.dateInStock) return false
      const days = Math.floor((now - v.dateInStock.getTime()) / 86400000)
      if (f.days_in_stock_min != null && days < f.days_in_stock_min) return false
      if (f.days_in_stock_max != null && days > f.days_in_stock_max) return false
    }
    if (f.text_match) {
      const q = f.text_match.toLowerCase()
      const hay = [v.stockNumber, v.vehicleInfo, v.make, v.model, v.color, v.location, v.purchasedFrom, v.titleStatus]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  if (f.sort_by) {
    const dir = f.sort_dir === 'asc' ? 1 : -1
    result = [...result].sort((a, b) => {
      const av = (a as any)[f.sort_by!]
      const bv = (b as any)[f.sort_by!]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir
    })
  }

  const count = result.length
  const mode = f.return_mode || 'count_and_list'
  const limit = Math.min(f.limit ?? 50, 200)
  const list = result.slice(0, limit).map(v => ({
    stock: v.stockNumber,
    vehicle: `${v.year || ''} ${v.make} ${v.model}`.trim(),
    color: v.color,
    miles: v.mileage,
    asking: v.askingPrice,
    cost: v.vehicleCost,
    type: v.purchaseType,
    status: v.status,
    location: v.location,
    daysInStock: v.dateInStock ? Math.floor((now - v.dateInStock.getTime()) / 86400000) : null,
  }))

  if (mode === 'count_only') return { count, truncated: false }
  return {
    count,
    list,
    truncated: count > limit,
  }
}

const QUERY_TOOL: Anthropic.Tool = {
  name: 'query_inventory',
  description:
    'Filter the dealership inventory by any combination of criteria. ALWAYS use this tool when answering questions that involve counting, listing, or filtering vehicles — never try to count from raw data yourself, as you will miss rows. The tool returns an accurate count and a list of matching vehicles.',
  input_schema: {
    type: 'object',
    properties: {
      purchase_types: {
        type: 'array', items: { type: 'string', enum: ['FLOORING', 'CONSIGNMENT', 'TRADE-IN'] },
        description: 'Filter by purchase type. FLOORING = dealer owns, CONSIGNMENT = third-party owned, TRADE-IN = taken on trade.',
      },
      statuses: {
        type: 'array', items: { type: 'string', enum: ['in_stock', 'in_recon', 'external_repair', 'sold', 'removed'] },
        description: 'Filter by status. Multiple values = OR (e.g. ["in_recon","external_repair"] = vehicles in recon OR external repair).',
      },
      year_min: { type: 'number', description: 'Earliest model year, inclusive.' },
      year_max: { type: 'number', description: 'Latest model year, inclusive.' },
      mileage_min: { type: 'number' },
      mileage_max: { type: 'number' },
      asking_price_min: { type: 'number' },
      asking_price_max: { type: 'number' },
      cost_min: { type: 'number', description: 'Minimum vehicle cost (what we paid).' },
      cost_max: { type: 'number' },
      makes: { type: 'array', items: { type: 'string' }, description: 'Case-insensitive substring match against make.' },
      models: { type: 'array', items: { type: 'string' }, description: 'Case-insensitive substring match against model.' },
      colors: { type: 'array', items: { type: 'string' } },
      title_statuses: { type: 'array', items: { type: 'string' } },
      purchased_from: { type: 'array', items: { type: 'string' }, description: 'Case-insensitive substring match.' },
      days_in_stock_min: { type: 'number', description: 'Minimum days since dateInStock.' },
      days_in_stock_max: { type: 'number', description: 'Maximum days since dateInStock.' },
      text_match: { type: 'string', description: 'Free-text search across stockNumber, make, model, color, location, etc.' },
      sort_by: { type: 'string', enum: ['dateInStock', 'mileage', 'year', 'askingPrice', 'vehicleCost'] },
      sort_dir: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'number', description: 'Max vehicles to return in the list (default 50, max 200). Count is always exact regardless of limit.' },
      return_mode: { type: 'string', enum: ['count_only', 'list', 'count_and_list'], description: 'count_only = just number; list = vehicles only; count_and_list (default) = both.' },
    },
  },
}

const SUMMARY_TOOL: Anthropic.Tool = {
  name: 'inventory_summary',
  description: 'Get aggregate statistics across the inventory: counts by status, counts by purchase type, totals, averages of mileage/price/cost. Use this for "how many X in total" or "what is the average Y" style questions when no filtering is needed beyond status/type breakdown.',
  input_schema: { type: 'object', properties: {} },
}

const STAGE_HISTORY_TOOL: Anthropic.Tool = {
  name: 'query_stage_history',
  description:
    'Query the recon stage history (VehicleStage records). Use this for ANY question about per-employee productivity, completion counts, time-per-vehicle, who-worked-on-what, or stage timing. Filter by stage (mechanic/detailing/content/publish), assignee name, status (done/in_progress/pending/skipped), and date ranges. Returns count, duration statistics (avg/median/min/max in ACTIVE WORK HOURS — start/pause/resume tracked, NOT wall-clock elapsed), per-assignee breakdown, and an optional list of records. Each list record also includes `elapsed_hours` (wall-clock) for comparison.',
  input_schema: {
    type: 'object',
    properties: {
      stages: {
        type: 'array', items: { type: 'string', enum: ['mechanic', 'detailing', 'content', 'publish'] },
        description: 'Which recon stages to include. Default: all.',
      },
      assignee_names: {
        type: 'array', items: { type: 'string' },
        description: 'Case-insensitive substring match against the assignee user name (e.g. ["Karla"]). Use null/empty to include any assignee.',
      },
      statuses: {
        type: 'array', items: { type: 'string', enum: ['pending', 'in_progress', 'done', 'skipped'] },
        description: 'Which stage statuses. For "completed work" use ["done"].',
      },
      completed_after: { type: 'string', description: 'ISO date (YYYY-MM-DD). Only stages completed on/after this date.' },
      completed_before: { type: 'string', description: 'ISO date (YYYY-MM-DD). Only stages completed on/before this date.' },
      started_after: { type: 'string', description: 'ISO date. Only stages started on/after.' },
      started_before: { type: 'string', description: 'ISO date. Only stages started on/before.' },
      limit: { type: 'number', description: 'Max records to return in the list (default 30). Count and stats are always exact.' },
      return_mode: {
        type: 'string',
        enum: ['count_only', 'summary', 'list', 'count_and_summary', 'full'],
        description: 'summary = stats only; list = records only; count_and_summary (default) = count + stats; full = everything.',
      },
    },
  },
  cache_control: { type: 'ephemeral' },
}

type StageHistoryFilter = {
  stages?: string[]
  assignee_names?: string[]
  statuses?: string[]
  completed_after?: string
  completed_before?: string
  started_after?: string
  started_before?: string
  limit?: number
  return_mode?: 'count_only' | 'summary' | 'list' | 'count_and_summary' | 'full'
}

async function queryStageHistory(f: StageHistoryFilter) {
  const where: any = {}
  if (f.stages?.length) where.stage = { in: f.stages }
  if (f.statuses?.length) where.status = { in: f.statuses }
  if (f.completed_after || f.completed_before) {
    where.completedAt = {}
    if (f.completed_after) where.completedAt.gte = new Date(f.completed_after)
    if (f.completed_before) where.completedAt.lte = new Date(`${f.completed_before}T23:59:59.999Z`)
  }
  if (f.started_after || f.started_before) {
    where.startedAt = {}
    if (f.started_after) where.startedAt.gte = new Date(f.started_after)
    if (f.started_before) where.startedAt.lte = new Date(`${f.started_before}T23:59:59.999Z`)
  }
  if (f.assignee_names?.length) {
    where.assignee = {
      OR: f.assignee_names.map(name => ({ name: { contains: name.trim(), mode: 'insensitive' } })),
    }
  }

  const stages = await prisma.vehicleStage.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      vehicle: { select: { stockNumber: true, year: true, make: true, model: true } },
    },
    orderBy: { completedAt: 'desc' },
  })

  const now = Date.now()
  // activeSeconds is accumulated work time (start/pause/resume tracked).
  // If timerStartedAt is set, the timer is currently running — add that delta too.
  function computeActiveHours(s: typeof stages[number]): number {
    let secs = s.activeSeconds || 0
    if (s.timerStartedAt) {
      secs += Math.max(0, Math.floor((now - s.timerStartedAt.getTime()) / 1000))
    }
    return secs / 3600
  }

  // Stats based on ACTIVE WORK TIME (not wall-clock elapsed)
  const activeHours: number[] = []
  const byAssignee: Record<string, number> = {}
  const byStage: Record<string, number> = {}
  for (const s of stages) {
    const name = s.assignee?.name || '(unassigned)'
    byAssignee[name] = (byAssignee[name] || 0) + 1
    byStage[s.stage] = (byStage[s.stage] || 0) + 1
    const active = computeActiveHours(s)
    if (active > 0) activeHours.push(active)
  }
  activeHours.sort((a, b) => a - b)
  const sum = activeHours.reduce((a, b) => a + b, 0)
  const stats = activeHours.length === 0 ? null : {
    avg_hours: Number((sum / activeHours.length).toFixed(2)),
    median_hours: Number(activeHours[Math.floor(activeHours.length / 2)].toFixed(2)),
    min_hours: Number(activeHours[0].toFixed(2)),
    max_hours: Number(activeHours[activeHours.length - 1].toFixed(2)),
    samples_with_active_time: activeHours.length,
    note: 'Hours are ACTIVE work time (start/pause/resume tracked), not wall-clock elapsed.',
  }

  const limit = Math.min(f.limit ?? 30, 200)
  const list = stages.slice(0, limit).map(s => {
    const activeH = computeActiveHours(s)
    const elapsedH = s.startedAt && s.completedAt
      ? (s.completedAt.getTime() - s.startedAt.getTime()) / 3600000
      : null
    return {
      stage: s.stage,
      status: s.status,
      assignee: s.assignee?.name || null,
      stock: s.vehicle.stockNumber,
      vehicle: `${s.vehicle.year || ''} ${s.vehicle.make} ${s.vehicle.model}`.trim(),
      started: s.startedAt?.toISOString() || null,
      completed: s.completedAt?.toISOString() || null,
      active_hours: Number(activeH.toFixed(2)),
      elapsed_hours: elapsedH != null ? Number(elapsedH.toFixed(2)) : null,
    }
  })

  const mode = f.return_mode || 'count_and_summary'
  const result: any = { count: stages.length }
  if (mode === 'summary' || mode === 'count_and_summary' || mode === 'full') {
    result.duration_stats = stats
    result.by_assignee = byAssignee
    result.by_stage = byStage
  }
  if (mode === 'list' || mode === 'full') {
    result.list = list
    result.truncated = stages.length > limit
  }
  return result
}

function summarize(vehicles: VehicleRow[]) {
  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}
  let priceSum = 0, priceCount = 0
  let costSum = 0, costCount = 0
  let mileSum = 0, mileCount = 0
  for (const v of vehicles) {
    byStatus[v.status] = (byStatus[v.status] || 0) + 1
    const t = (v.purchaseType || '(none)').trim().toUpperCase()
    byType[t] = (byType[t] || 0) + 1
    if (v.askingPrice != null) { priceSum += v.askingPrice; priceCount++ }
    if (v.vehicleCost != null) { costSum += v.vehicleCost; costCount++ }
    if (v.mileage != null) { mileSum += v.mileage; mileCount++ }
  }
  return {
    total_active: vehicles.length,
    by_status: byStatus,
    by_purchase_type: byType,
    avg_asking_price: priceCount ? Math.round(priceSum / priceCount) : null,
    avg_vehicle_cost: costCount ? Math.round(costSum / costCount) : null,
    avg_mileage: mileCount ? Math.round(mileSum / mileCount) : null,
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { question, history } = await req.json() as {
    question: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  if (!question?.trim()) return NextResponse.json({ error: 'Question required' }, { status: 400 })

  const vehicles: VehicleRow[] = await prisma.inventoryVehicle.findMany({
    where: { isActive: true },
    select: {
      stockNumber: true, vehicleInfo: true, year: true, make: true, model: true,
      color: true, mileage: true, location: true, askingPrice: true, vehicleCost: true,
      purchaseType: true, purchasedFrom: true, titleStatus: true, dateInStock: true, status: true,
    },
  })

  const todayIso = new Date().toISOString().split('T')[0]
  const system = `You are an analyst for a used car dealership. You answer questions about inventory AND recon stage history (who worked on what, how long, how many completed).

Today's date is ${todayIso}.

Inventory:
- Status values: in_stock, in_recon (in our own recon shop), external_repair (at an outside shop), sold, removed.
- Purchase type values: FLOORING (dealer owns outright), CONSIGNMENT (third-party owned), TRADE-IN.

Recon stages: mechanic → detailing → content → publish. Each stage is a VehicleStage record with assignee, startedAt, completedAt.

RULES:
1. For questions about vehicles in inventory (counts, lists, filters), call query_inventory or inventory_summary.
2. For questions about employees' work output (e.g. "how many cars did Karla complete in the last 2 weeks", "average detailing time", "who has the longest mechanic time"), call query_stage_history with the appropriate filters (use statuses: ["done"] for completed work). Duration stats are based on ACTIVE WORK TIME (start/pause/resume tracked) — not wall-clock elapsed. State this clearly in the answer if asked about timing.
3. For relative date phrases, convert to ISO dates relative to today: "last 2 weeks" = completed_after ${new Date(Date.now() - 14*86400000).toISOString().split('T')[0]}; "this month" = completed_after ${todayIso.slice(0,8)}01; etc.
4. You may call multiple tools in sequence.
5. Be concise. Lead with the number, then optionally list specifics. Don't pad with explanations.`

  // Cap history at last 8 turns (16 messages) to keep context lean
  const trimmedHistory = (history || []).slice(-16)
  const messages: Anthropic.MessageParam[] = [
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ]

  try {
    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: [QUERY_TOOL, SUMMARY_TOOL, STAGE_HISTORY_TOOL],
        messages,
      })

      if (response.stop_reason === 'tool_use') {
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        messages.push({ role: 'assistant', content: response.content })
        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(toolUses.map(async tu => {
          let result: any
          if (tu.name === 'query_inventory') {
            result = applyFilter(vehicles, tu.input as Filter)
          } else if (tu.name === 'inventory_summary') {
            result = summarize(vehicles)
          } else if (tu.name === 'query_stage_history') {
            result = await queryStageHistory(tu.input as StageHistoryFilter)
          } else {
            result = { error: `Unknown tool: ${tu.name}` }
          }
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          }
        }))
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('\n').trim()
      return NextResponse.json({ answer: text, count: vehicles.length })
    }
    return NextResponse.json({ error: 'Too many tool-use iterations' }, { status: 500 })
  } catch (e: any) {
    console.error('[inventory-ask] error', e.message)
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 })
  }
}
