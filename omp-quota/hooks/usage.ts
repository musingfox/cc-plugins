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
