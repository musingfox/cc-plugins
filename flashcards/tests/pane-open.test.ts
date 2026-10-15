import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import type { Card, Deck } from '../types'
import { cards, paneProps, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('Flashcards')
const DAY = 86400000

function card(id: string, q = `Question ${id}?`): Card {
  return { id, sourcePath: 'docs/spec/a.md', sourceHash: 'h', kind: 'rule', q, a: `Answer ${id}.`, quote: 'Rules must hold.' }
}

const deckOf = (...items: Card[]): Deck => ({ v: 1, sources: { 'docs/spec/a.md': { hash: 'h', type: 'spec' } }, cards: items })

describe('/cards opens the review pane', () => {
  test('opens a focused pane without closeOnEscape and shows the first due card', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: deckOf(card('c1', 'What is first?'), card('c2')) } })
    await $.session.start(SESSION)
    expect(await $.command.run(cards())).toEqual({})
    expect(seen.opened).toEqual([{ id: 'cards', title: 'Flashcards', focus: true }])
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    expect((await ui.find({ key: 'progress' }))?.text).toContain('1/2')
    expect((await ui.find({ key: 'question' }))?.text).toBe('What is first?')
    expect(await ui.find({ text: /Answer c1/ })).toBeUndefined()
  })

  test('with no deck in the store the pane says how to make one', async ($, on) => {
    world(on, {})
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    expect(await ui.find({ text: '這個 repo 還沒有牌組。先跑 /cards build。' })).toBeDefined()
  })

  test('a deck with nothing due says what it holds, by box', async ($, on) => {
    const key = await repoKey('/work')
    const review = { c1: { box: 2 as const, due: 1000 + DAY } }
    world(on, { now: 1000, store: { [`deck:${key}`]: deckOf(card('c1')), [`review:${key}`]: review } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    expect(await ui.find({ text: '共 1 張：第 1 格 0 · 第 2 格 1 · 第 3 格 0' })).toBeDefined()
  })

  test('a question with an escape and 20000 characters is drawn cut and clean', async ($, on) => {
    const key = await repoKey('/work')
    const long = `\u001b${'x'.repeat(20000)}`
    world(on, { store: { [`deck:${key}`]: deckOf(card('c1', long)) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    const drawn = (await ui.find({ key: 'question' }))!.text as string
    expect(drawn.length).toBeLessThanOrEqual(10000)
    expect(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(drawn)).toBe(false)
  })

  test('a store that refuses the deck shows the read error, not an empty pane', async ($, on) => {
    world(on, { refuse: 'get' })
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    expect(await ui.find({ text: '讀不到這個 repo 的牌組（Claude store 拒絕讀取）。' })).toBeDefined()
  })

  test('a card deleted from the deck between open and render is skipped', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: deckOf(card('c1', 'First?'), card('c2', 'Second?')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    seen.store[`deck:${key}`] = deckOf(card('c2', 'Second?'))
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    expect((await ui.find({ key: 'question' }))?.text).toBe('Second?')
  })
  test('opening the pane raises no model event; a control spawn is recorded, so the recorder is live', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: deckOf(card('c1')) } })
    await $.session.start(SESSION)
    await $.command.run(cards())
    await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
    expect(seen.models).toEqual([])
    expect(seen.tools).toEqual([])
    expect(seen.spawns).toEqual([])
    await $.agent.spawn({ prompt: 'control', model: 'haiku', description: 'control' } as any)
    expect(seen.spawns).toHaveLength(1)
  })
})
