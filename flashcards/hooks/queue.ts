import type { Card, Review } from '../types'

// A card is due when it has no review entry or its entry is due; the hardest box comes first.
export function dueQueue(cards: Card[], review: Review, now: number): string[] {
  const due = cards.flatMap((card) => {
    const entry = review[card.id]
    if (entry && entry.due > now) return []
    return [{ id: card.id, box: entry?.box ?? 1, due: entry?.due ?? 0 }]
  })
  due.sort((a, b) => a.box - b.box || a.due - b.due || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return due.map((item) => item.id)
}
