import { countRows, isMissing } from './counts.ts'
import { cardName, keptRows } from './rows.ts'
import { PRIORITY_ORDER, STATUS_ORDER } from './style.ts'

type Row = { path: string; status?: string | null; priority?: string | null; title?: string | null; due?: string | null; tags?: string | null }

export type BoardRow = { path: string; badge: 'H' | 'M' | 'L' | ' '; title: string; due: string; tags: string }
export type BoardGroup = { status: string | null; count: number; rows: BoardRow[] }

const BADGES: Record<string, BoardRow['badge']> = { high: 'H', medium: 'M', low: 'L' }

function statusCount(counted: ReturnType<typeof countRows>, status: string | null) {
  return status === null ? counted.status.missing : counted.status.values.find((entry) => entry.value === status)!.count
}

function byPriority<R extends Row>(rows: R[]) {
  const buckets = new Map<string | null, R[]>()
  const extras: string[] = []
  for (const row of rows) {
    const priority = isMissing(row.priority) ? null : row.priority
    if (!buckets.has(priority)) {
      buckets.set(priority, [])
      if (priority !== null && !PRIORITY_ORDER.includes(priority)) extras.push(priority)
    }
    buckets.get(priority)!.push(row)
  }
  return [...PRIORITY_ORDER.filter((priority) => buckets.has(priority)), ...extras, ...(buckets.has(null) ? [null] : [])].flatMap(
    (priority) => buckets.get(priority)!,
  )
}

function boardRow(row: Row): BoardRow {
  return {
    path: row.path,
    badge: (typeof row.priority === 'string' && BADGES[row.priority]) || ' ',
    title: isMissing(row.title) ? cardName(row.path) : row.title,
    due: row.due ?? '',
    tags: row.tags ?? '',
  }
}

export function listGroups(project: string, rows: Row[]): { groups: BoardGroup[]; hidden: number } {
  const counted = countRows(project, rows)
  const kept = keptRows(project, rows)
  const named = counted.status.values.map((entry) => entry.value)
  const statuses: (string | null)[] = [
    ...STATUS_ORDER.filter((status) => named.includes(status)),
    ...named.filter((status) => !STATUS_ORDER.includes(status)),
    ...(counted.status.missing > 0 ? [null] : []),
  ]
  const groups = statuses.map((status) => ({
    status,
    count: statusCount(counted, status),
    rows: byPriority(kept.filter((row) => (status === null ? isMissing(row.status) : row.status === status))).map(boardRow),
  }))
  return { groups, hidden: 0 }
}
