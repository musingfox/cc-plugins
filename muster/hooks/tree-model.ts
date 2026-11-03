import type { RunRow, TreeGroup } from '../types/index.d.ts'

// Issues sort by their text with runs dispatched without one last; within an issue the oldest run comes first.
export function groupByIssue(runs: RunRow[]): TreeGroup[] {
  const groups = new Map<string | null, RunRow[]>()
  for (const run of runs) groups.set(run.issue, [...(groups.get(run.issue) ?? []), run])
  const order = (a: string | null, b: string | null) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b))
  return [...groups.entries()]
    .sort(([a], [b]) => order(a, b))
    .map(([issue, members]) => ({ issue, runs: [...members].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name)) }))
}

// An exited run left no report, so its exit reason is the only account of how it ended.
export const treeStateLabel = (run: Pick<RunRow, 'state' | 'exitReason'>): string =>
  run.state === 'question' ? '? question' : run.state === 'exited' && run.exitReason ? `exited · ${run.exitReason}` : run.state
