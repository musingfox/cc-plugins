import { describe, expect, test } from 'claude-code/testing'
import { hashText } from '../hooks/hash.ts'
import { loadDeck, loadReview, repoKey, saveDeck, saveReview } from '../hooks/deck-store.ts'
import type { Deck } from '../types'
import { fake } from './fixtures/fake.ts'

const DECK: Deck = { v: 1, sources: { 'docs/spec/a.md': { hash: 'h', type: 'spec' } }, cards: [] }
const EMPTY: Deck = { v: 1, sources: {}, cards: [] }

describe('repoKey', () => {
  test('is the first 16 hex of the root hash, and differs per root', async () => {
    expect(await repoKey('/work/a')).toBe((await hashText('/work/a')).slice(0, 16))
    expect(await repoKey('/work/a')).not.toBe(await repoKey('/work/b'))
    expect(await repoKey('/work/a')).toBe(await repoKey('/work/a'))
  })
})

describe('deck storage', () => {
  test('a saved deck loads back equal, under the deck key of its root', async () => {
    const { $, data } = fake()
    expect(await saveDeck($, '/work/a', DECK)).toBe(true)
    expect(await loadDeck($, '/work/a')).toEqual(DECK)
    expect(data[`deck:${await repoKey('/work/a')}`]).toEqual(DECK)
  })

  test('another root loads an empty deck', async () => {
    const { $ } = fake()
    await saveDeck($, '/work/a', DECK)
    expect(await loadDeck($, '/work/b')).toEqual(EMPTY)
  })

  test('a deck the store cannot read, or one of another version or shape, loads as null', async () => {
    const key = await repoKey('/work/a')
    expect(await loadDeck(fake({ store: { [`deck:${key}`]: { v: 2 } } }).$, '/work/a')).toBeNull()
    expect(await loadDeck(fake({ store: { [`deck:${key}`]: 'junk' } }).$, '/work/a')).toBeNull()
    expect(await loadDeck(fake({ refuse: 'get' }).$, '/work/a')).toBeNull()
  })

  test('a deck with a card missing a field loads as null, so the pane never draws it', async () => {
    const key = await repoKey('/work/a')
    const card = { id: 'c1', sourcePath: 'docs/spec/a.md', sourceHash: 'h', kind: 'rule', q: 'Q?', a: 'A.' }
    expect(await loadDeck(fake({ store: { [`deck:${key}`]: { v: 1, sources: {}, cards: [card] } } }).$, '/work/a')).toBeNull()
  })

  test('a failed store write returns false for the deck and for the review', async () => {
    const { $ } = fake({ refuse: 'set' })
    expect(await saveDeck($, '/work/a', DECK)).toBe(false)
    expect(await saveReview($, '/work/a', {})).toBe(false)
  })

  test('a malformed review value loads as an empty review', async () => {
    const key = await repoKey('/work/a')
    expect(await loadReview(fake({ store: { [`review:${key}`]: ['nope'] } }).$, '/work/a')).toEqual({})
    expect(await loadReview(fake().$, '/work/a')).toEqual({})
  })
})
