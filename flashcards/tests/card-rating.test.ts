import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import type { Card, Deck, Review } from '../types'
import { cards, paneProps, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('Flashcards')
const DAY = 86400000

function card(id: string, q = `Question ${id}?`): Card {
  return { id, sourcePath: 'docs/spec/a.md', sourceHash: 'h', kind: 'rule', q, a: `Answer ${id}.`, quote: 'Rules must hold.' }
}

const deckOf = (...items: Card[]): Deck => ({ v: 1, sources: { 'docs/spec/a.md': { hash: 'h', type: 'spec' } }, cards: items })

async function pane($: any) {
  return $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
}

describe('1, 2 and 3 rate the flipped card', () => {
  test('rating 3 on a new card files it in box 2, due a day later, and the pane says done', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { now: 1000, store: { [`deck:${key}`]: deckOf(card('c1')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await pane($)
    await ui.press({ key: 'flip' })
    await ui.press({ key: 'rate:3' })
    expect(seen.store[`review:${key}`]).toEqual({ c1: { box: 2, due: 1000 + DAY } })
    expect(await ui.find({ text: /這輪複習完 1 張：記得 1、模糊 0、忘了 0。/ })).toBeDefined()
  })

  test('rating 1 on a box-3 card drops it to box 1, due now', async ($, on) => {
    const key = await repoKey('/work')
    const review: Review = { c1: { box: 3, due: 0 } }
    const seen = world(on, { now: 1000, store: { [`deck:${key}`]: deckOf(card('c1')), [`review:${key}`]: review } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await pane($)
    await ui.press({ key: 'flip' })
    await ui.press({ key: 'rate:1' })
    expect(seen.store[`review:${key}`]).toEqual({ c1: { box: 1, due: 1000 } })
  })

  test('the stored progress is what the next session deals from', async ($, on) => {
    const key = await repoKey('/work')
    world(on, { now: 1000, store: { [`deck:${key}`]: deckOf(card('c1')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const first = await pane($)
    await first.press({ key: 'flip' })
    await first.press({ key: 'rate:3' })
    await first.unmount()
    await $.session.start(SESSION)
    await $.command.run(cards())
    const second = await pane($)
    expect(await second.find({ text: '共 1 張：第 1 格 0 · 第 2 格 1 · 第 3 格 0' })).toBeDefined()
  })

  test('after a rating the next card comes up unflipped', async ($, on) => {
    const key = await repoKey('/work')
    world(on, { now: 1000, store: { [`deck:${key}`]: deckOf(card('c1', 'First?'), card('c2', 'Second?')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await pane($)
    await ui.press({ key: 'flip' })
    await ui.press({ key: 'rate:2' })
    expect((await ui.find({ key: 'question' }))?.text).toBe('Second?')
    expect(await ui.find({ key: 'answer' })).toBeUndefined()
  })

  test('a rating before the flip does nothing', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { now: 1000, store: { [`deck:${key}`]: deckOf(card('c1')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    await pane($)
    expect(Object.keys(seen.store).filter((k) => k.startsWith('review:'))).toEqual([])
  })

  test('a store that refuses the write keeps the next card coming', async ($, on) => {
    const key = await repoKey('/work')
    world(on, { now: 1000, refuse: 'set', store: { [`deck:${key}`]: deckOf(card('c1', 'First?'), card('c2', 'Second?')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await pane($)
    await ui.press({ key: 'flip' })
    await ui.press({ key: 'rate:3' })
    expect((await ui.find({ key: 'question' }))?.text).toBe('Second?')
  })
})
