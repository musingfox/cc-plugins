export type QuotaStatus = 'ok' | 'warning' | 'exhausted'

export type LimitQuota = {
  id: string
  label: string
  windowLabel: string
  resetsAt: number | null
  share: number | null
  status: QuotaStatus | null
}

export type ProviderQuota = {
  provider: string
  limits: LimitQuota[]
  share: number | null
  status: QuotaStatus | null
}

export type Usage = { providers: ProviderQuota[] }

export type OmpOutcome = { kind: 'exited'; exitCode: number; stdout: string } | { kind: 'rejected' }

export type UsageReading = { ok: true; usage: Usage } | { ok: false; reason: string }

const STATUS_RANK: Record<QuotaStatus, number> = { ok: 0, warning: 1, exhausted: 2 }

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

export function remainingShareOf(amount: unknown): number | null {
  const remaining = field(amount, 'remainingFraction')
  const used = field(amount, 'usedFraction')
  const share = isFiniteNumber(remaining) ? remaining : isFiniteNumber(used) ? 1 - used : null
  return share === null ? null : Math.min(1, Math.max(0, share))
}

function statusOf(value: unknown): QuotaStatus | null {
  return value === 'ok' || value === 'warning' || value === 'exhausted' ? value : null
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function limitOf(raw: unknown): LimitQuota | null {
  const id = field(raw, 'id')
  if (typeof id !== 'string') return null
  const window = field(raw, 'window')
  const resetsAt = field(window, 'resetsAt')
  return {
    id,
    label: stringOf(field(raw, 'label')),
    windowLabel: stringOf(field(window, 'label')),
    resetsAt: isFiniteNumber(resetsAt) ? resetsAt : null,
    share: remainingShareOf(field(raw, 'amount')),
    status: statusOf(field(raw, 'status')),
  }
}

function providerOf(provider: string, limits: LimitQuota[]): ProviderQuota {
  const shares = limits.map((l) => l.share).filter((s): s is number => s !== null)
  const statuses = limits.map((l) => l.status).filter((s): s is QuotaStatus => s !== null)
  return {
    provider,
    limits,
    share: shares.length ? Math.min(...shares) : null,
    status: statuses.length ? statuses.reduce((a, b) => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a)) : null,
  }
}

export function readUsage(outcome: OmpOutcome): UsageReading {
  if (outcome.kind === 'rejected') return { ok: false, reason: 'omp did not answer' }
  if (outcome.exitCode !== 0) return { ok: false, reason: `omp exited ${outcome.exitCode}` }
  let parsed: unknown
  try {
    parsed = JSON.parse(outcome.stdout)
  } catch {
    return { ok: false, reason: 'omp output unreadable' }
  }
  const reports = field(parsed, 'reports')
  if (!Array.isArray(reports)) return { ok: false, reason: 'omp output unreadable' }
  if (reports.length === 0) return { ok: false, reason: 'omp reported no providers' }
  const grouped = new Map<string, LimitQuota[]>()
  for (const report of reports) {
    const provider = stringOf(field(report, 'provider'))
    const rawLimits = field(report, 'limits')
    const limits = (Array.isArray(rawLimits) ? rawLimits : []).map(limitOf).filter((l): l is LimitQuota => l !== null)
    grouped.set(provider, [...(grouped.get(provider) ?? []), ...limits])
  }
  return { ok: true, usage: { providers: [...grouped].map(([provider, limits]) => providerOf(provider, limits)) } }
}
