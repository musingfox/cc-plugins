import type { LimitQuota, Usage } from './usage.ts'

export type QuotaView = { usage: Usage | null; failure: string | null; lastGoodAt: number | null }

export type WindowCell = { window: string; share: string; shareColor?: string; status: string | null; resets: string }

export type ProviderSection = { provider: string; windows: WindowCell[] }

export type QuotaModel = { notice: string | null; providers: ProviderSection[] }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const RED = '#e5484d'
const ORANGE = '#f5a524'
const GREEN = '#46a758'

function percentOf(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`
}

export function shareColorOf(share: number | null): string | undefined {
  if (share === null) return undefined
  const percent = Math.round(share * 100)
  return percent <= 30 ? RED : percent <= 60 ? ORANGE : GREEN
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

function leastIndexOf(limits: LimitQuota[]): number {
  let least = 0
  limits.forEach((limit, i) => {
    const share = limits[least]!.share
    if (limit.share !== null && (share === null || limit.share < share)) least = i
  })
  return least
}

function worstBadStatusOf(limits: LimitQuota[]): string | null {
  if (limits.some((l) => l.status === 'exhausted')) return 'exhausted'
  return limits.some((l) => l.status === 'warning') ? 'warning' : null
}

function byNullLast(a: number | null, b: number | null): number {
  return (a ?? Infinity) - (b ?? Infinity)
}

function windowsOf(limits: LimitQuota[], nowMs: number): WindowCell[] {
  const groups = new Map<string, LimitQuota[]>()
  for (const limit of limits) {
    const key = limit.windowLabel || limit.label
    groups.set(key, [...(groups.get(key) ?? []), limit])
  }
  return [...groups]
    .map(([window, members]) => ({ window, members, least: members[leastIndexOf(members)]! }))
    .sort((a, b) => byNullLast(a.least.resetsAt, b.least.resetsAt))
    .map(({ window, members, least }) => ({
      window,
      share: percentOf(least.share),
      shareColor: shareColorOf(least.share),
      status: worstBadStatusOf(members),
      resets: resetsOf(least.resetsAt, nowMs),
    }))
}

function sectionsOf(usage: Usage, nowMs: number): ProviderSection[] {
  return usage.providers
    .filter((provider) => provider.limits.length)
    .sort((a, b) => byNullLast(a.share, b.share))
    .map((provider) => ({ provider: provider.provider, windows: windowsOf(provider.limits, nowMs) }))
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
