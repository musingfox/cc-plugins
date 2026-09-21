import { bounded } from './bounds.ts'
import { countRows, isMissing } from './counts.ts'
import { cardName, keptRows } from './rows.ts'
import { PRIORITY_ORDER, STATUS_ORDER } from './style.ts'

type Row = { path: string; status?: string | null; priority?: string | null }

function statusCount(counted: ReturnType<typeof countRows>, status: string | null) {
  return status === null ? counted.status.missing : counted.status.values.find((entry) => entry.value === status)!.count
}

export function groupedOptions(project: string, rows: Row[]) {
  const counted = countRows(project, rows)
  const kept = keptRows(project, rows)
  const named = counted.status.values.map((entry) => entry.value)
  const statuses: (string | null)[] = [
    ...STATUS_ORDER.filter((status) => named.includes(status)),
    ...named.filter((status) => !STATUS_ORDER.includes(status)),
    ...(counted.status.missing > 0 ? [null] : []),
  ]
  const options: { value: string; label: string }[] = []
  statuses.forEach((status, n) => {
    options.push({ value: `#${n}`, label: bounded(`${status ?? '—'} (${statusCount(counted, status)})`).text })
    if (status === 'done') return
    const ofStatus = kept.filter((row) => (status === null ? isMissing(row.status) : row.status === status))
    const buckets = new Map<string | null, Row[]>()
    const extras: string[] = []
    for (const row of ofStatus) {
      const priority = isMissing(row.priority) ? null : row.priority
      if (!buckets.has(priority)) {
        buckets.set(priority, [])
        if (priority !== null && !PRIORITY_ORDER.includes(priority)) extras.push(priority)
      }
      buckets.get(priority)!.push(row)
    }
    ;[...PRIORITY_ORDER.filter((priority) => buckets.has(priority)), ...extras, ...(buckets.has(null) ? [null] : [])].forEach(
      (priority, m) => {
        options.push({ value: `#p${n}.${m}`, label: bounded(`  ${priority ?? '—'}`).text })
        for (const row of buckets.get(priority)!) {
          options.push({ value: bounded(row.path).text, label: bounded(`    ${cardName(row.path)}`).text })
        }
      },
    )
  })
  return options
}
