import { percentOf } from './pane-rows.ts'
import type { QuotaView } from './pane-rows.ts'

export function statusLineOf(view: QuotaView): string {
  if (!view.usage) return view.failure ? `omp quota: unavailable (${view.failure})` : 'omp quota: fetching'
  const shares = view.usage.providers.map((p) => `${p.provider} ${percentOf(p.share)}`).join(' · ')
  return `omp quota: ${shares}${view.failure ? ' (stale)' : ''}`
}
