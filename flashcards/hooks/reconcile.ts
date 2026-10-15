import type { Deck, Detection } from '../types'

// A recorded source is gone only when its own detection answered ok and neither lists its path.
export function reconcile(deck: Deck, repo: Detection, vault: Detection): { deck: Deck; removedCardIds: string[] } {
  const gone = (path: string, type: string) => {
    const detected = type === 'task' ? vault : repo
    return detected.status === 'ok' && !detected.sources.some((source) => source.path === path) && !detected.unreadable.includes(path)
  }
  const removed = new Set(Object.entries(deck.sources).filter(([path, record]) => gone(path, record.type)).map(([path]) => path))
  const sources = Object.fromEntries(Object.entries(deck.sources).filter(([path]) => !removed.has(path)))
  const cards = deck.cards.filter((card) => !removed.has(card.sourcePath))
  const removedCardIds = deck.cards.filter((card) => removed.has(card.sourcePath)).map((card) => card.id)
  return { deck: { ...deck, sources, cards }, removedCardIds }
}
