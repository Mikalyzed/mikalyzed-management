/**
 * Detecting hand-written install tasks that duplicate the parts flow.
 *
 * The correct flow: part arrives → mark it Received → the install task
 * creates itself (tagged fromPart). A manually typed "install bumper" task
 * bypasses that and doubles up. These helpers spot the pattern so the
 * system can warn at write time and flag survivors on the meeting watchlist.
 */

const INSTALL_VERBS = /\b(install|mount|put\s+on|swap\s+in|replace\s+with)\b/i

const STOP_WORDS = new Set([
  'install', 'the', 'for', 'with', 'and', 'kit', 'set', 'new', 'assembly',
  'compatible', 'side', 'front', 'rear', 'left', 'right', 'driver', 'passenger',
])

function significantWords(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w)),
  )
}

export function isInstallLike(taskText: string): boolean {
  return INSTALL_VERBS.test(taskText)
}

/** Does this task text look like it's about this part? */
export function taskMatchesPart(taskText: string, partName: string): boolean {
  const task = significantWords(taskText)
  if (task.size === 0) return false
  const part = significantWords(partName)
  let overlap = 0
  for (const w of task) if (part.has(w)) overlap++
  // Install-verbed task sharing ≥1 meaningful word with the part, or heavy
  // overlap regardless of verb.
  return (isInstallLike(taskText) && overlap >= 1) || overlap >= 3
}

export type PartLite = { id: string; name: string; status: string; installTaskCreatedAt: Date | string | null }

/** First part this task appears to duplicate, if any. */
export function findInstallDuplicate(taskText: string, parts: PartLite[]): PartLite | null {
  if (!isInstallLike(taskText)) return null
  for (const p of parts) {
    if (taskMatchesPart(taskText, p.name)) return p
  }
  return null
}
