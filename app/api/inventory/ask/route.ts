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
  cache_control: { type: 'ephemeral' },
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

  const system = `You are an inventory analyst for a used car dealership. You answer questions about the current inventory.

Status values: in_stock, in_recon (in our own recon shop), external_repair (at an outside shop), sold, removed.
Purchase type values: FLOORING (dealer owns outright), CONSIGNMENT (third-party owned), TRADE-IN.

RULES:
1. For ANY question about counting, listing, or filtering vehicles, you MUST call query_inventory. Never count from memory — you will miss rows.
2. For aggregate stats across all inventory (total count, averages, breakdowns), call inventory_summary.
3. You may call multiple tools in sequence if needed to answer a multi-part question.
4. After tools return, give a concise answer. State the number first, then optionally list stock numbers + vehicle descriptions. Don't pad with explanations the user didn't ask for.`

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
        tools: [QUERY_TOOL, SUMMARY_TOOL],
        messages,
      })

      if (response.stop_reason === 'tool_use') {
        const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        messages.push({ role: 'assistant', content: response.content })
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map(tu => {
          let result: any
          if (tu.name === 'query_inventory') {
            result = applyFilter(vehicles, tu.input as Filter)
          } else if (tu.name === 'inventory_summary') {
            result = summarize(vehicles)
          } else {
            result = { error: `Unknown tool: ${tu.name}` }
          }
          return {
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          }
        })
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
