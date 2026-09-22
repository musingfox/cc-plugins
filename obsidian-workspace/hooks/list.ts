import { bounded } from './bounds.ts'
import { countRows, isMissing } from './counts.ts'
import { cardName, keptRows } from './rows.ts'
import { PRIORITY_ORDER, STATUS_ORDER } from './style.ts'

type Row = { path: string; status?: string | null; priority?: string | null; title?: string | null; due?: string | null; tags?: string | null }

export type BoardRow = { path: string; badge: 'H' | 'M' | 'L' | ' '; title: string; due: string; tags: string }
export type BoardGroup = { status: string | null; count: number; rows: BoardRow[] }

const BADGES: Record<string, BoardRow['badge']> = { high: 'H', medium: 'M', low: 'L' }
// Caps chosen so the worst-case list, every character JSON-escaped, serializes under the engine's 100,000-character props bound.
const MAX_SHOWN = 100
const MAX_PATH = 200
const MAX_TITLE = 80
const MAX_TAGS = 48
const MAX_DUE = 16
const MAX_STATUS = 32

// bounded keeps tab and newline; either would break a list line in two or skew its columns.
const oneLine = (text: string, max: number) => bounded(text, max).text.replace(/[\t\n]+/g, ' ')

// A cut status ends in …, so two statuses sharing a capped prefix are not taken for one.
function statusLabel(status: string) {
  return bounded(status, MAX_STATUS).clippedFrom === null ? oneLine(status, MAX_STATUS) : `${oneLine(status, MAX_STATUS - 1)}…`
}

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
    badge: (typeof row.priority === 'string' && Object.hasOwn(BADGES, row.priority) && BADGES[row.priority]) || ' ',
    title: oneLine(row.title ?? '', MAX_TITLE) || oneLine(cardName(row.path), MAX_TITLE),
    due: oneLine(row.due ?? '', MAX_DUE),
    tags: oneLine(row.tags ?? '', MAX_TAGS),
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
  const groups: BoardGroup[] = []
  let shown = 0
  let hidden = 0
  for (const status of statuses) {
    const ofStatus = byPriority(kept.filter((row) => (status === null ? isMissing(row.status) : row.status === status)))
    const drawn: BoardRow[] = []
    for (const row of ofStatus) {
      if (row.path.length > MAX_PATH || shown >= MAX_SHOWN) hidden++
      else {
        drawn.push(boardRow(row))
        shown++
      }
    }
    if (drawn.length) {
      groups.push({ status: status === null ? null : statusLabel(status), count: statusCount(counted, status), rows: drawn })
    }
  }
  return { groups, hidden }
}
