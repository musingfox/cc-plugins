import { describe, expect, test } from 'claude-code/testing'
import { dueQueue } from '../hooks/queue.ts'
import type { Card } from '../types'

function card(id: string): Card {
  return { id, sourcePath: 'docs/spec/a.md', sourceHash: 'h', kind: 'rule', q: 'q', a: 'a', quote: 'a' }
}

describe('dueQueue', () => {
  test('deals new and due cards, hardest box first, then the earliest due', () => {
    const cards = [card('c1'), card('c2'), card('c3')]
    const review = { c2: { box: 3 as const, due: 0 }, c3: { box: 2 as const, due: 5000 } }
    expect(dueQueue(cards, review, 1000)).toEqual(['c1', 'c2'])
  })

  test('a new card counts as box 1 due at 0', () => {
    const cards = [card('c1'), card('c4')]
    const review = { c4: { box: 1 as const, due: 500 } }
    expect(dueQueue(cards, review, 1000)).toEqual(['c1', 'c4'])
  })

  test('review entries for cards not in the deck are ignored', () => {
    expect(dueQueue([card('c1')], { gone: { box: 1, due: 0 } }, 1000)).toEqual(['c1'])
  })

  test('an empty deck deals nothing', () => {
    expect(dueQueue([], {}, 1000)).toEqual([])
  })
})
