import type { VehicleStatusReport } from './vehicle-status'
import { isInstallLike, taskMatchesPart } from '@/lib/install-task-match'

/**
 * Bottleneck detection for the Morning Meeting board.
 *
 * Deliberately deterministic — every check is a code rule over live DMS data,
 * not an AI judgment, so the same condition is flagged every single morning
 * until someone clears it. AI is only used where language is involved (the
 * smart input); catching operational drift is rules' work.
 *
 * Every finding carries a typed `fix` so the board can offer the remedy on
 * the card itself — update a return date, mark sent, clear a stale flag,
 * create install tasks — without leaving the meeting page. Fixes execute
 * through the normal CRUD endpoints.
 */

export type BottleneckFix =
  | { kind: 'external_return_date'; externalId: string } // push/update expected return
  | { kind: 'external_mark_sent'; externalId: string }   // pending → sent today (+ estimate)
  | { kind: 'clear_awaiting_parts'; stageId: string }
  | { kind: 'part_status'; partId: string }              // requested → sourced/ordered
  | { kind: 'reschedule_stage'; stageId: string }
  | { kind: 'install_tasks'; vehicleId: string; canCreate: boolean; parts: Array<{ id: string; name: string }> }
  | { kind: 'confirm_received'; partId: string }
  | { kind: 'remove_task'; stageId: string; idx: number; item: string }

export type Bottleneck = {
  severity: 'crit' | 'warn'
  stock: string | null
  vehicle: string | null
  /** Where the car currently is — "in recon — content (pending, Ali)", "in stock", "at Shop X". */
  where: string | null
  /** Short headline — what is wrong, at a glance. */
  issue: string
  /** One-sentence explanation under the headline. */
  detail: string
  fix?: BottleneckFix
}

const STUCK_REQUESTED_DAYS = 7
const NEVER_SENT_DAYS = 5

export function detectBottlenecks(r: VehicleStatusReport): Bottleneck[] {
  const out: Bottleneck[] = []

  // Where is each car right now? Used so a card can say "in recon — content
  // (pending, Ali)" instead of leaving the admin guessing.
  const whereabouts = new Map<string, string>()
  for (const v of r.inStock) {
    whereabouts.set(v.stock, `in stock${v.location ? ` — ${v.location}` : ''}`)
  }
  for (const e of r.externalRepairs) {
    // partOnly: the component is at the shop, the car is not
    if (!e.partOnly && (e.status === 'sent' || e.status === 'in_progress' || e.status === 'ready')) {
      whereabouts.set(e.stock, `at ${e.shop}${e.status === 'ready' ? ' (ready for pickup)' : ''}`)
    }
  }
  for (const v of r.recon) {
    const status = v.stageStatus === 'in_progress' ? 'in progress' : 'pending'
    whereabouts.set(v.stock, v.stage
      ? `in recon — ${v.stage} (${status}${v.assignee ? `, ${v.assignee}` : ''})`
      : 'in recon — no open stage')
  }
  const whereOf = (stock: string | null) => (stock && whereabouts.get(stock)) || null

  // 1. Externals past their expected return date
  for (const e of r.externalRepairs) {
    if (e.overdueDays > 0) {
      out.push({
        severity: e.overdueDays >= 30 ? 'crit' : 'warn',
        stock: e.stock,
        vehicle: e.vehicle,
        where: whereOf(e.stock),
        issue: `${e.overdueDays}d overdue at ${e.shop}`,
        detail: `Expected back ${e.expectedBack ?? '—'} for: ${e.work.slice(0, 80)}`,
        fix: { kind: 'external_return_date', externalId: e.externalId },
      })
    }
  }

  // 2. External repairs created but never sent to the shop
  for (const e of r.externalRepairs) {
    if (e.status === 'pending' && e.createdAgoDays >= NEVER_SENT_DAYS) {
      out.push({
        severity: 'warn',
        stock: e.stock,
        vehicle: e.vehicle,
        where: whereOf(e.stock),
        issue: `Never sent to ${e.shop}`,
        detail: `Created ${e.createdAgoDays}d ago for: ${e.work.slice(0, 80)}`,
        fix: { kind: 'external_mark_sent', externalId: e.externalId },
      })
    }
  }

  // 3. Car flagged "awaiting parts" but every part has arrived
  const receivedByStock = new Map<string, number>()
  const inboundByStock = new Map<string, number>()
  for (const p of r.parts) {
    const m = p.status === 'received' ? receivedByStock : inboundByStock
    m.set(p.stock, (m.get(p.stock) ?? 0) + 1)
  }
  for (const v of r.recon) {
    if (v.awaitingParts && !inboundByStock.has(v.stock) && receivedByStock.has(v.stock) && v.stageId) {
      out.push({
        severity: 'warn',
        stock: v.stock,
        vehicle: v.vehicle,
        where: whereOf(v.stock),
        issue: 'Waiting on parts that already arrived',
        detail: `All ${receivedByStock.get(v.stock)} of its parts are here — the mechanic can resume.`,
        fix: { kind: 'clear_awaiting_parts', stageId: v.stageId },
      })
    }
  }

  // 4. Parts stuck in requested
  for (const p of r.parts) {
    if (p.status === 'requested' && p.ageDays > STUCK_REQUESTED_DAYS) {
      out.push({
        severity: 'warn',
        stock: p.stock,
        vehicle: p.vehicle,
        where: whereOf(p.stock),
        issue: `Part stuck in requested ${p.ageDays}d`,
        detail: `"${p.part}" — nobody has sourced or ordered it.`,
        fix: { kind: 'part_status', partId: p.partId },
      })
    }
  }

  // 5. Scheduled date came and went while the stage stayed pending
  const today = new Date().toISOString().slice(0, 10)
  for (const v of r.recon) {
    if (v.scheduledDate && v.scheduledDate < today && v.stageStatus === 'pending' && v.stageId) {
      out.push({
        severity: 'warn',
        stock: v.stock,
        vehicle: v.vehicle,
        where: whereOf(v.stock),
        issue: 'Missed its scheduled date',
        detail: `Was scheduled for ${v.scheduledDate}; the ${v.stage} stage is still pending.`,
        fix: { kind: 'reschedule_stage', stageId: v.stageId },
      })
    }
  }

  // 5b. Carrier says delivered but nobody marked the part received —
  // the package is probably sitting in receiving unlogged.
  for (const p of r.parts) {
    if (p.status === 'ordered' && (p.trackingStatus === 'delivered' || p.trackingStatus === 'available_for_pickup')) {
      out.push({
        severity: 'warn',
        stock: p.stock,
        vehicle: p.vehicle,
        where: whereOf(p.stock),
        issue: p.trackingStatus === 'available_for_pickup' ? 'Package ready for pickup' : 'Carrier says delivered',
        detail: `"${p.part}" shows ${p.trackingStatus === 'available_for_pickup' ? 'ready for pickup' : 'delivered'} by the carrier — confirm it arrived and mark it received.`,
        fix: { kind: 'confirm_received', partId: p.partId },
      })
    }
  }

  // 5c. Hand-written install tasks that bypass the parts flow. The correct
  // flow is: mark the part Received → the install task creates itself
  // (fromPart). A manual "install X" either doubles the auto task or hides
  // the fact the part never got received.
  const partsByStock = new Map<string, typeof r.parts>()
  for (const p of r.parts) {
    if (!partsByStock.has(p.stock)) partsByStock.set(p.stock, [])
    partsByStock.get(p.stock)!.push(p)
  }
  for (const v of r.recon) {
    if (!v.stageId) continue
    const carParts = partsByStock.get(v.stock) ?? []
    if (carParts.length === 0) continue
    for (const t of v.tasks) {
      if (t.done || t.fromPart || !isInstallLike(t.item)) continue
      const match = carParts.find(p => taskMatchesPart(t.item, p.part))
      if (!match) continue
      const autoExists = v.tasks.some(x => x.fromPart && !x.done && taskMatchesPart(x.item, match.part))
      if (autoExists) {
        out.push({
          severity: 'warn',
          stock: v.stock,
          vehicle: v.vehicle,
          where: whereOf(v.stock),
          issue: 'Duplicate install task',
          detail: `"${t.item.slice(0, 50)}" was written by hand but the parts flow already created the install task for "${match.part.slice(0, 45)}". Remove the manual one.`,
          fix: { kind: 'remove_task', stageId: v.stageId, idx: t.idx, item: t.item },
        })
      } else if (match.status !== 'received') {
        out.push({
          severity: 'warn',
          stock: v.stock,
          vehicle: v.vehicle,
          where: whereOf(v.stock),
          issue: 'Install task written by hand',
          detail: `"${t.item.slice(0, 50)}" — but the part "${match.part.slice(0, 45)}" is still ${match.status}. Mark the part Received when it arrives and the install task creates itself; this manual one will double up.`,
          fix: { kind: 'remove_task', stageId: v.stageId, idx: t.idx, item: t.item },
        })
      }
    }
  }

  // 5c2. Part is here but the car isn't in recon — no mechanic checklist
  // exists to carry the install task, so the part sits on a shelf invisible.
  // Re-fires until the car gets routed into recon (or the part is used).
  // Capped at 21 days since the part was last touched: fresh arrivals get a
  // card; long-settled parts (installed before this rule existed) don't flood
  // the meeting. Each new arrival also gets a durable admin follow-up task.
  const reconStocks = new Set(r.recon.map(v => v.stock))
  for (const p of r.parts) {
    const touched = (p as { touchedAgeDays?: number }).touchedAgeDays ?? 99
    if (p.status === 'received' && !p.installTaskCreated && !reconStocks.has(p.stock) && touched <= 21) {
      out.push({
        severity: 'warn',
        stock: p.stock,
        vehicle: p.vehicle,
        where: whereOf(p.stock),
        issue: (p as { soldCar?: boolean }).soldCar ? 'Part here, car already sold' : 'Part here, car not in recon',
        detail: (p as { soldCar?: boolean }).soldCar
          ? `"${p.part}" arrived but this car is marked sold — install it before delivery, or return the part.`
          : `"${p.part}" arrived but this car has no active recon stage to carry the install. Route it into recon (the install task will surface in routing) or log where the part is being held.`,
      })
    }
  }

  // 5d. Game plan stalled: the active step hasn't moved in a week — the
  // system's "what's next" is being ignored.
  for (const v of [...r.recon, ...r.inStock]) {
    const p = (v as { plan?: { step: string | null; stepSinceDays: number | null; finished: number; total: number } }).plan
    if (p?.step && p.stepSinceDays != null && p.stepSinceDays > 7) {
      out.push({
        severity: 'warn',
        stock: v.stock,
        vehicle: v.vehicle,
        where: whereOf(v.stock),
        issue: `Game plan stalled ${p.stepSinceDays}d`,
        detail: `Step ${p.finished + 1}/${p.total} — "${p.step.slice(0, 60)}" — has been the next move for ${p.stepSinceDays} days.`,
      })
    }
  }

  // 6. Received parts with no install task
  const activeMechanicByStock = new Map(
    r.recon
      .filter(v => v.stage === 'mechanic' && (v.stageStatus === 'in_progress' || v.stageStatus === 'pending'))
      .map(v => [v.stock, true] as const),
  )
  const noInstall = new Map<string, { vehicle: string; vehicleId: string; parts: Array<{ id: string; name: string }> }>()
  for (const p of r.parts) {
    if (p.status === 'received' && !p.installTaskCreated) {
      const cur = noInstall.get(p.stock) ?? { vehicle: p.vehicle, vehicleId: p.vehicleId, parts: [] }
      cur.parts.push({ id: p.partId, name: p.part })
      noInstall.set(p.stock, cur)
    }
  }
  for (const [stock, g] of noInstall) {
    if (g.parts.length >= 3) {
      const canCreate = activeMechanicByStock.has(stock)
      const where = whereOf(stock)
      out.push({
        severity: 'warn',
        stock,
        vehicle: g.vehicle,
        where,
        issue: `${g.parts.length} parts with no install task`,
        detail: canCreate
          ? `Car is ${where ?? 'in mechanic'} — install tasks can go straight onto its checklist.`
          : `Car is ${where ?? 'not in recon'} — mark parts handled, or flag a follow-up to route it back to mechanic.`,
        fix: { kind: 'install_tasks', vehicleId: g.vehicleId, canCreate, parts: g.parts },
      })
    }
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'crit' ? -1 : 1))
}
