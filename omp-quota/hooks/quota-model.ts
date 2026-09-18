import type { LimitQuota, Usage } from './usage.ts'

export type QuotaView = { usage: Usage | null; failure: string | null; lastGoodAt: number | null }

export type LimitRow = { name: string; share: string; status: string; resets: string }

export type ProviderSection = { heading: string; rows: LimitRow[]; empty: string | null; lowest: LimitRow | null }

export type QuotaModel = { notice: string | null; providers: ProviderSection[] }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function percentOf(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`
}

function durationOf(ms: number): string {
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`
  return `${Math.floor(ms / MINUTE)}m`
}

function resetsOf(resetsAt: number | null, nowMs: number): string {
  if (resetsAt === null) return '—'
  return resetsAt <= nowMs ? 'now' : durationOf(resetsAt - nowMs)
}

function baseNameOf(limit: LimitQuota): string {
  return limit.windowLabel && limit.windowLabel !== limit.label ? `${limit.label} · ${limit.windowLabel}` : limit.label
}

function sharedCount(lists: string[][], at: (list: string[], i: number) => string | undefined): number {
  let n = 0
  while (lists.every((list) => at(list, n) !== undefined && at(list, n) === at(lists[0]!, n))) n += 1
  return n
}

// Only the id is unique among limits whose label and window repeat; the tag keeps the id
// segments that differ inside the group, and never shrinks an id to nothing.
function tagsOf(ids: string[]): string[] {
  const segments = ids.map((id) => id.split(':'))
  const shortest = Math.min(...segments.map((s) => s.length))
  const prefix = Math.min(sharedCount(segments, (s, i) => s[i]), shortest - 1)
  const suffix = Math.min(sharedCount(segments, (s, i) => s[s.length - 1 - i]), shortest - 1 - prefix)
  return segments.map((s) => s.slice(prefix, s.length - suffix).join(':'))
}

function rowNamesOf(limits: LimitQuota[]): string[] {
  const names = limits.map(baseNameOf)
  const groups = new Map<string, number[]>()
  names.forEach((name, i) => groups.set(name, [...(groups.get(name) ?? []), i]))
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const tags = tagsOf(members.map((i) => limits[i]!.id))
    members.forEach((i, k) => (names[i] = `${names[i]} [${tags[k]}]`))
  }
  return names
}

function lowestIndexOf(limits: LimitQuota[]): number {
  let lowest = 0
  limits.forEach((limit, i) => {
    const least = limits[lowest]!.share
    if (limit.share !== null && (least === null || limit.share < least)) lowest = i
  })
  return lowest
}

function sectionsOf(usage: Usage, nowMs: number): ProviderSection[] {
  return usage.providers.map((provider) => {
    const names = rowNamesOf(provider.limits)
    const rows = provider.limits.map((limit, i) => ({
      name: names[i]!,
      share: percentOf(limit.share),
      status: limit.status ?? '—',
      resets: resetsOf(limit.resetsAt, nowMs),
    }))
    return {
      heading: `${provider.provider} ${percentOf(provider.share)}`,
      rows,
      empty: provider.limits.length ? null : 'no limits reported',
      lowest: rows[lowestIndexOf(provider.limits)] ?? null,
    }
  })
}

export function quotaModelOf(view: QuotaView, nowMs: number): QuotaModel {
  if (!view.usage) {
    return { notice: view.failure ? `Unavailable: ${view.failure}` : 'Fetching omp usage', providers: [] }
  }
  const notice = view.failure
    ? `Stale: ${view.failure}; showing data from ${durationOf(nowMs - (view.lastGoodAt ?? nowMs))} ago`
    : null
  return { notice, providers: sectionsOf(view.usage, nowMs) }
}
