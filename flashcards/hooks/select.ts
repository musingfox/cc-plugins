import type { Deck, Source } from '../types'

// Specs and ADRs go first by path; tasks follow, newest completion first, undated last, then by path.
function compare(a: Source, b: Source): number {
  if (a.type !== 'task' || b.type !== 'task') {
    if (a.type === 'task') return 1
    if (b.type === 'task') return -1
  } else if (a.completed !== b.completed) {
    if (a.completed === null) return 1
    if (b.completed === null) return -1
    return a.completed < b.completed ? 1 : -1
  }
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

export function selectBuild(deck: Deck, sources: Source[], limit = 20, batchSize = 10): { batches: Source[][]; pendingCount: number; remaining: number } {
  const pending = sources.filter((source) => deck.sources[source.path]?.hash !== source.hash)
  const selected = [...pending].sort(compare).slice(0, limit)
  const batches: Source[][] = []
  for (let i = 0; i < selected.length; i += batchSize) batches.push(selected.slice(i, i + batchSize))
  return { batches, pendingCount: pending.length, remaining: pending.length - selected.length }
}
