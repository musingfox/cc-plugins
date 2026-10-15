import { describe, expect, test } from 'claude-code/testing'
import { reconcile } from '../hooks/reconcile.ts'
import type { Card, Deck, Detection } from '../types'

function card(id: string, sourcePath: string): Card {
  return { id, sourcePath, sourceHash: 'h', kind: 'rule', q: 'q', a: 'a', quote: 'a' }
}

function detection(sources: string[], status: Detection['status'] = 'ok', unreadable: string[] = []): Detection {
  return { sources: sources.map((path) => ({ path, type: 'task', text: '', hash: 'h', completed: null })), unreadable, status }
}

const EMPTY = detection([])

describe('reconcile', () => {
  test('a recorded spec missing from an ok repo listing is removed with its cards', () => {
    const deck: Deck = {
      v: 1,
      sources: { 'docs/spec/a.md': { hash: 'h', type: 'spec' }, 'docs/spec/b.md': { hash: 'h', type: 'spec' } },
      cards: [card('a1', 'docs/spec/a.md'), card('b1', 'docs/spec/b.md')],
    }
    const repo = { sources: [{ path: 'docs/spec/a.md', type: 'spec' as const, text: '', hash: 'h', completed: null }], unreadable: [], status: 'ok' as const }
    const result = reconcile(deck, repo, EMPTY)
    expect(result.deck.sources).toEqual({ 'docs/spec/a.md': { hash: 'h', type: 'spec' } })
    expect(result.deck.cards).toEqual([card('a1', 'docs/spec/a.md')])
    expect(result.removedCardIds).toEqual(['b1'])
    expect(deck.cards).toHaveLength(2)
  })

  test('a vault task is kept while the vault errors, and removed once the vault answers ok', () => {
    const deck: Deck = { v: 1, sources: { 'pm/p/tasks/x.md': { hash: 'h', type: 'task' } }, cards: [card('x1', 'pm/p/tasks/x.md')] }
    expect(reconcile(deck, EMPTY, detection([], 'error')).removedCardIds).toEqual([])
    expect(reconcile(deck, EMPTY, detection([], 'ok')).removedCardIds).toEqual(['x1'])
  })

  test('a task is kept while its vault status is unconfigured', () => {
    const deck: Deck = { v: 1, sources: { 'pm/p/tasks/x.md': { hash: 'h', type: 'task' } }, cards: [card('x1', 'pm/p/tasks/x.md')] }
    expect(reconcile(deck, EMPTY, detection([], 'unconfigured')).deck.cards).toHaveLength(1)
  })

  test('a path listed as unreadable is kept', () => {
    const deck: Deck = { v: 1, sources: { 'pm/p/tasks/x.md': { hash: 'h', type: 'task' } }, cards: [card('x1', 'pm/p/tasks/x.md')] }
    expect(reconcile(deck, EMPTY, detection([], 'ok', ['pm/p/tasks/x.md'])).deck.cards).toHaveLength(1)
  })

  test('a source whose hash changed keeps its record and cards', () => {
    const deck: Deck = { v: 1, sources: { 'docs/spec/a.md': { hash: 'old', type: 'spec' } }, cards: [card('a1', 'docs/spec/a.md')] }
    const repo = detection(['docs/spec/a.md'])
    expect(reconcile(deck, repo, EMPTY).deck).toEqual(deck)
  })
})
