import type { Card, Kind, Source } from '../types'
import { hashText } from './hash.ts'
import { KINDS } from './prompt.ts'
import type { RawCard } from './reply.ts'

export type DropReason = 'unknown-source' | 'kind' | 'fields' | 'quote' | 'duplicate' | 'over-limit'

const PER_SOURCE_LIMIT = 3

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

// Async because the card id is a SHA-256, which only crypto.subtle computes.
export async function acceptCards(raw: RawCard[], batch: Source[]): Promise<{ accepted: Card[]; dropped: { reason: DropReason }[] }> {
  const accepted: Card[] = []
  const dropped: { reason: DropReason }[] = []
  const ids = new Set<string>()
  const perSource = new Map<string, number>()
  for (const card of raw) {
    const source = batch.find((candidate) => candidate.path === card.source)
    if (!source) {
      dropped.push({ reason: 'unknown-source' })
      continue
    }
    const q = text(card.q)
    const a = text(card.a)
    const quote = text(card.quote)
    if (!q || !a || !quote) {
      dropped.push({ reason: 'fields' })
      continue
    }
    if (!KINDS[source.type].includes(card.kind as Kind)) {
      dropped.push({ reason: 'kind' })
      continue
    }
    if (!source.text.includes(quote)) {
      dropped.push({ reason: 'quote' })
      continue
    }
    const id = (await hashText(`${source.path}\n${q}`)).slice(0, 16)
    if (ids.has(id)) {
      dropped.push({ reason: 'duplicate' })
      continue
    }
    const count = perSource.get(source.path) ?? 0
    if (count >= PER_SOURCE_LIMIT) {
      dropped.push({ reason: 'over-limit' })
      continue
    }
    ids.add(id)
    perSource.set(source.path, count + 1)
    accepted.push({ id, sourcePath: source.path, sourceHash: source.hash, kind: card.kind as Kind, q, a, quote })
  }
  return { accepted, dropped }
}
