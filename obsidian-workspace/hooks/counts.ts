import { keptRows, rowsOutside } from './rows.ts'

export const COUNT_VIEW = 'All Tasks'

type Row = { path: string; status?: string | null; priority?: string | null }

export function isMissing(value: string | null | undefined): value is null | undefined | '' {
  return typeof value !== 'string' || value === ''
}

function tally(values: (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  let missing = 0
  for (const value of values) {
    if (isMissing(value)) {
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

export function missingViewHint(project: string, message: string) {
  return message.split('\n', 1)[0] === `Error: View not found: ${COUNT_VIEW}`
    ? `pm/${project}/dashboard.base has no ${COUNT_VIEW} view. Run /obw:pm refresh dashboard to regenerate it from the plugin template; hand edits to that file are overwritten.`
    : null
}
