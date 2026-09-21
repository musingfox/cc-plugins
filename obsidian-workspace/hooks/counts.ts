import { keptRows, rowsOutside } from './rows.ts'

export const COUNT_VIEW = 'All Tasks'

type Row = { path: string; status?: string | null; priority?: string | null }

function tally(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  let missing = 0
  for (const value of values) {
    if (typeof value !== 'string' || value === '') {
      missing++
      continue
    }
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return { values: [...counts].map(([value, count]) => ({ value, count })), missing }
}

export function countRows(project: string, rows: Row[]) {
  const counted = keptRows(project, rows)
  return {
    total: counted.length,
    outside: rowsOutside(project, rows),
    status: tally(counted.map((row) => row.status)),
    priority: tally(counted.map((row) => row.priority)),
  }
}
