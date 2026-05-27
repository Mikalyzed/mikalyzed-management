import type { PrismaClient } from '@prisma/client'
import { fieldsForItem } from './checklist-fields'

/**
 * Helpers for working with the issues/added-tasks/parts that come out of a
 * completed inspection (or any completed stage). The same utilities power:
 *   - The "needs review" banner on the pending-routing card
 *   - The smart pre-fill in the routing modal
 *   - The in-app notification fired when mechanic completes a stage with issues
 */

const ISSUE_STATUSES = new Set(['issue', 'yes'])

/**
 * Human-readable labels for sub-field fix tasks. We use a hardcoded map for
 * sub-fields whose default field label is ambiguous on its own (e.g. "Play",
 * "Noises") — those get expanded into "Steering play", "Suspension noises".
 * Anything not in the map falls back to the field label as defined in
 * lib/checklist-fields.ts.
 */
const FIX_SUBFIELD_LABELS: Record<string, Record<string, string>> = {
  fluids: {
    powerSteering: 'Power steering fluid',
    brake: 'Brake fluid',
    engineOil: 'Engine oil',
    transmission: 'Transmission fluid',
    antifreeze: 'Antifreeze',
  },
  engineCheck: {
    sparkPlug: 'Spark plug',
    coil: 'Coil',
    distributorCap: 'Distributor cap',
    sparkPlugWires: 'Spark plug wires',
  },
  electrical: {
    regularBeam: 'Regular beam',
    highBeam: 'High beam',
    fogLights: 'Fog lights',
    radio: 'Radio',
    top: 'Convertible top',
    brakeLights: 'Brake lights',
    reverseLights: 'Reverse lights',
    turnSignals: 'Turn signals',
  },
  steeringCheck: { play: 'Steering play' },
  suspensionCheck: {
    shaking: 'Suspension shaking',
    noises: 'Suspension noises',
  },
}

export type ChecklistItem = {
  item: string
  done: boolean
  note?: string
  type?: string
  data?: Record<string, unknown>
  fields?: { key: string; label: string }[]
  addedByMechanic?: boolean
  approved?: 'pending' | 'approved' | 'declined' | string
  estimatedHours?: number
}

/** A "fix" task derived from an issue flagged during the previous stage. */
export type SuggestedFix = {
  /** Human-readable title prefixed with "Fix: " */
  item: string
  /** The note describing the issue (carried from the original item or sub-field) */
  note: string
  /** Source: 'subfield' = came from a rich-data sub-field, 'simple' = top-level item note */
  source: 'subfield' | 'simple'
  /** Original parent item name (e.g. "Oil & fluids check") for grouping/debug */
  parentItem: string
}

/** A task the mechanic added mid-inspection. */
export type AddedTask = {
  item: string
  note: string
  estimatedHours?: number
  approved?: string
  /** Index in the original checklist array — used to update approved status later */
  originalIndex: number
}

/**
 * Scans a completed stage's checklist for items flagged as issues:
 *   - Sub-fields with status='issue' or 'yes'
 *   - Simple items (no rich data) with a non-empty note
 *
 * Returns an array of "Fix: ..." tasks ready to seed the next mechanic stage.
 */
export function extractIssueFixTasks(checklist: ChecklistItem[]): SuggestedFix[] {
  const fixes: SuggestedFix[] = []

  for (const item of checklist) {
    // Skip mechanic-added tasks — they have their own dedicated flow.
    if (item.addedByMechanic) continue

    // Rich-data items: scan sub-fields for issue/yes status.
    if (item.type && item.data) {
      const fields = fieldsForItem(item)
      for (const f of fields) {
        const v = item.data[f.key]
        if (v && typeof v === 'object' && 'status' in v) {
          const status = String((v as { status?: string }).status || '').toLowerCase()
          if (!ISSUE_STATUSES.has(status)) continue
          const note = String((v as { note?: string }).note || '').trim()
          const label = FIX_SUBFIELD_LABELS[item.type]?.[f.key] || f.label
          fixes.push({
            item: `Fix: ${label}`,
            note,
            source: 'subfield',
            parentItem: item.item,
          })
        }
      }
      continue
    }

    // Simple items: a non-empty note implies the mechanic wants something done.
    const note = (item.note || '').trim()
    if (note) {
      fixes.push({
        item: `Fix: ${item.item}`,
        note,
        source: 'simple',
        parentItem: item.item,
      })
    }
  }

  return fixes
}

/**
 * Returns tasks the mechanic added mid-stage that are still actionable (not
 * declined). Each carries its originalIndex so admin's approve/decline
 * decision can be persisted back to the original stage checklist.
 */
export function extractAddedTasks(checklist: ChecklistItem[]): AddedTask[] {
  const tasks: AddedTask[] = []
  checklist.forEach((item, originalIndex) => {
    if (!item.addedByMechanic) return
    if (item.approved === 'declined') return
    tasks.push({
      item: item.item,
      note: (item.note || '').trim(),
      estimatedHours: item.estimatedHours,
      approved: item.approved,
      originalIndex,
    })
  })
  return tasks
}

/**
 * Quick summary for banners/notifications: counts only, no full lists.
 */
export function summarizeReview(checklist: ChecklistItem[]): {
  issueCount: number
  addedTaskCount: number
  hasAnything: boolean
} {
  const issueCount = extractIssueFixTasks(checklist).length
  const addedTaskCount = extractAddedTasks(checklist).length
  return {
    issueCount,
    addedTaskCount,
    hasAnything: issueCount + addedTaskCount > 0,
  }
}

/**
 * Returns parts that have been received but haven't yet had an install task
 * created for them. These are the parts the routing modal should suggest
 * adding "Install [part]" tasks for when the vehicle next hits routing.
 */
export async function findPendingInstallParts(
  tx: PrismaClient | { part: { findMany: PrismaClient['part']['findMany'] } },
  vehicleId: string,
): Promise<{ id: string; name: string; url: string | null }[]> {
  const parts = await tx.part.findMany({
    where: {
      vehicleId,
      status: 'received',
      installTaskCreatedAt: null,
    },
    select: { id: true, name: true, url: true },
    orderBy: { updatedAt: 'asc' },
  })
  return parts.map(p => ({ id: p.id, name: p.name.trim(), url: p.url }))
}
