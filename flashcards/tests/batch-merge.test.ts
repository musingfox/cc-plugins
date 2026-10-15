import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import { hashText } from '../hooks/hash.ts'
import type { Card, Deck, Review } from '../types'
import { cards, SESSION, world } from './fixtures/world.ts'

const SPEC_TEXT = 'Rules must hold. Never skip the gate.\n'
const SPEC = '/work/docs/spec/rules.md'
const SPEC_DIR = { '/work/docs/spec': [{ name: 'rules.md', kind: 'file' as const }] }
const VALID = '[{"source":"docs/spec/rules.md","kind":"rule","q":"Which step must never be skipped?","a":"The gate.","quote":"Never skip the gate."}]'

async function oneSpecBuild($: any, on: any, extra: Record<string, unknown> = {}) {
  const seen = world(on, { files: { [SPEC]: SPEC_TEXT }, dirs: SPEC_DIR, ...extra })
  await $.session.start(SESSION)
  await $.command.run(cards('build'))
  await seen.clock.settle()
  return seen
}

const deckOf = (seen: { store: Record<string, unknown> }, key: string) => seen.store[`deck:${key}`] as Deck
const reply = (answer: string, reason = 'answer') => ({ agentId: 'agent-1', reason, answer, durationMs: 1, isAborted: false, turnId: 't1' }) as any

describe('batch merge', () => {
  test('a valid reply becomes the card for its source, and the source is recorded', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    await $.turn.complete(reply(VALID))
    await seen.clock.settle()
    const deck = deckOf(seen, await repoKey('/work'))
    expect(deck.cards).toHaveLength(1)
    expect(deck.cards[0]).toMatchObject({ sourcePath: 'docs/spec/rules.md', kind: 'rule', quote: 'Never skip the gate.' })
    expect(deck.sources['docs/spec/rules.md']).toEqual({ hash: deck.cards[0]!.sourceHash, type: 'spec' })
  })

  test('the prose around a valid array is ignored', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    await $.turn.complete(reply(`Warning: review raised a concern [see log]\n${VALID}\nDone.`))
    expect(deckOf(seen, await repoKey('/work')).cards).toHaveLength(1)
  })

  test('a card whose quote is not in the source is dropped; the valid one stays', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    const bad = '{"source":"docs/spec/rules.md","kind":"rule","q":"Which gate is open?","a":"Any.","quote":"Gates are open."}'
    await $.turn.complete(reply(`[${bad},${VALID.slice(1, -1)}]`))
    expect(deckOf(seen, await repoKey('/work')).cards.map((c: Card) => c.q)).toEqual(['Which step must never be skipped?'])
  })

  test('a source whose every card is rejected stays pending, so the next build retries it', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    const bad = '{"source":"docs/spec/rules.md","kind":"rule","q":"Which gate is open?","a":"Any.","quote":"Gates are open."}'
    await $.turn.complete(reply(`[${bad}]`))
    expect(deckOf(seen, await repoKey('/work')).sources).toEqual({})
  })

  test('a source the model gives no card is recorded, so it is not sent again', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    await $.turn.complete(reply('[]'))
    expect(Object.keys(deckOf(seen, await repoKey('/work')).sources)).toEqual(['docs/spec/rules.md'])
  })

  test('an error reply leaves the deck and the source pending', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    await $.turn.complete(reply(VALID, 'error'))
    expect(deckOf(seen, await repoKey('/work')).sources).toEqual({})
  })

  test('an unparseable answer leaves the source pending', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    await $.turn.complete(reply('not json at all'))
    expect(deckOf(seen, await repoKey('/work')).sources).toEqual({})
  })

  test('a rebuild after the spec changed replaces its old card and review entry, and keeps the unchanged source', async ($, on) => {
    const key = await repoKey('/work')
    const otherHash = await hashText('x')
    const old: Card = { id: 'old1', sourcePath: 'docs/spec/rules.md', sourceHash: 'stale', kind: 'rule', q: 'q', a: 'a', quote: 'Never skip the gate.' }
    const other: Card = { id: 'keep1', sourcePath: 'docs/spec/other.md', sourceHash: otherHash, kind: 'rule', q: 'q2', a: 'a2', quote: 'x' }
    const deck: Deck = {
      v: 1,
      sources: { 'docs/spec/rules.md': { hash: 'stale', type: 'spec' }, 'docs/spec/other.md': { hash: otherHash, type: 'spec' } },
      cards: [old, other],
    }
    const review: Review = { old1: { box: 2, due: 5 }, keep1: { box: 1, due: 0 } }
    const seen = world(on, {
      store: { [`deck:${key}`]: deck, [`review:${key}`]: review },
      files: { [SPEC]: SPEC_TEXT, '/work/docs/spec/other.md': 'x' },
      dirs: { '/work/docs/spec': [{ name: 'rules.md', kind: 'file' }, { name: 'other.md', kind: 'file' }] },
    })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await $.turn.complete(reply(VALID))
    const stored = deckOf(seen, key)
    expect(stored.cards.map((c: Card) => c.id)).toContain('keep1')
    expect(stored.cards.some((c: Card) => c.id === 'old1')).toBe(false)
    expect(stored.cards).toHaveLength(2)
    expect(seen.store[`review:${key}`]).toEqual({ keep1: { box: 1, due: 0 } })
  })

  test('a reply for an agent that is not a batch, or no agent, leaves the deck alone', async ($, on) => {
    const seen = await oneSpecBuild($, on)
    await $.turn.complete({ ...reply(VALID), agentId: 'someone-else' })
    await $.turn.complete({ reason: 'answer', answer: VALID, durationMs: 1, isAborted: false, turnId: 't2' })
    expect(deckOf(seen, await repoKey('/work')).sources).toEqual({})
  })

  test('a deck that cannot be saved is a failed batch: nothing is written and nothing throws', async ($, on) => {
    const key = await repoKey('/work')
    const seen = await oneSpecBuild($, on)
    seen.refuse = 'set'
    const before = deckOf(seen, key)
    await expect($.turn.complete(reply(VALID))).resolves.toBeDefined()
    expect(deckOf(seen, key)).toEqual(before)
  })
})
