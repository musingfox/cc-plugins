import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import { hashText } from '../hooks/hash.ts'
import type { Card, Deck, Review } from '../types'
import { cards, SESSION, world } from './fixtures/world.ts'

const KEEP = 'Rules must hold.\n'
const CONFIG = '/work/.obsidian.yaml'
const VAULT_CONFIG = 'vault: obsidian\npm:\n  project: cc-plugins\n'

function card(id: string, sourcePath: string): Card {
  return { id, sourcePath, sourceHash: 'h', kind: 'rule', q: 'q', a: 'a', quote: 'Rules must hold.' }
}

describe('/cards build prunes the deck first', () => {
  test('a deleted spec loses its cards and review entries; a present spec keeps both', async ($, on) => {
    const key = await repoKey('/work')
    const deck: Deck = {
      v: 1,
      sources: { 'docs/spec/gone.md': { hash: 'x', type: 'spec' }, 'docs/spec/keep.md': { hash: await hashText(KEEP), type: 'spec' } },
      cards: [card('g1', 'docs/spec/gone.md'), card('k1', 'docs/spec/keep.md')],
    }
    const review: Review = { g1: { box: 1, due: 0 }, k1: { box: 2, due: 5 } }
    const seen = world(on, {
      store: { [`deck:${key}`]: deck, [`review:${key}`]: review },
      files: { '/work/docs/spec/keep.md': KEEP },
      dirs: { '/work/docs/spec': [{ name: 'keep.md', kind: 'file' }] },
    })
    await $.session.start(SESSION)
    expect(await $.command.run(cards('build'))).toEqual({})
    await seen.clock.settle()
    const stored = seen.store[`deck:${key}`] as Deck
    expect(stored.cards.map((c) => c.id)).toEqual(['k1'])
    expect(Object.keys(stored.sources)).toEqual(['docs/spec/keep.md'])
    expect(seen.store[`review:${key}`]).toEqual({ k1: { box: 2, due: 5 } })
  })

  test('a deck that cannot be read is left as it is, with a toast and no spawn', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: 'junk' } })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).toEqual(['Flashcards deck could not be read; build stopped so it is not overwritten.'])
    expect(seen.store[`deck:${key}`]).toBe('junk')
    expect(seen.spawns).toEqual([])
  })

  test('a vault error toasts the skip and keeps the vault-sourced cards', async ($, on) => {
    const key = await repoKey('/work')
    const task = 'pm/cc-plugins/tasks/x.md'
    const deck: Deck = {
      v: 1,
      sources: { [task]: { hash: 'h', type: 'task' } },
      cards: [{ ...card('x1', task), kind: 'why' }],
    }
    const seen = world(on, {
      store: { [`deck:${key}`]: deck },
      files: { [CONFIG]: VAULT_CONFIG },
      query: 'Error: no such base',
    })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts[0]).toBe('Vault task cards skipped: Error: no such base')
    expect((seen.store[`deck:${key}`] as Deck).cards.map((c) => c.id)).toEqual(['x1'])
  })

  test('a deck that cannot be saved toasts and spawns nothing; the next build is not stopped', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: { v: 1, sources: {}, cards: [] } }, refuse: 'set' })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).toEqual(['Flashcards deck could not be saved; build stopped.'])
    expect(seen.spawns).toEqual([])
    expect(await $.command.run(cards('build'))).toEqual({})
    await seen.clock.settle()
    expect(seen.toasts[1]).toBe('Flashcards deck could not be saved; build stopped.')
  })

  test('the command resolves to {} before the continuation has finished', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: { v: 1, sources: { 'docs/spec/gone.md': { hash: 'x', type: 'spec' } }, cards: [card('g1', 'docs/spec/gone.md')] } } })
    await $.session.start(SESSION)
    expect(await $.command.run(cards('build'))).toEqual({})
    await seen.clock.settle()
    expect((seen.store[`deck:${key}`] as Deck).cards).toEqual([])
  })
})
