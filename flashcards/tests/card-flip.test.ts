import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import type { Card, Deck } from '../types'
import { cards, paneProps, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('Flashcards')

function card(id: string, a = `Answer ${id}.`): Card {
  return { id, sourcePath: 'docs/spec/a.md', sourceHash: 'h', kind: 'rule', q: `Question ${id}?`, a, quote: 'Rules must hold.' }
}

const deckOf = (...items: Card[]): Deck => ({ v: 1, sources: { 'docs/spec/a.md': { hash: 'h', type: 'spec' } }, cards: items })

async function mountWith(on: any, $: any, deck: Deck | null) {
  const key = await repoKey('/work')
  world(on, deck ? { store: { [`deck:${key}`]: deck } } : {})
  await $.session.start(SESSION)
  await $.command.run(cards())
  return $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
}

describe('f flips the card', () => {
  test('before the flip there is a flip button and no rating; after it the answer and three ratings', async ($, on) => {
    const ui = await mountWith(on, $, deckOf(card('c1')))
    expect((await ui.find({ key: 'flip' }))?.props.hotkey).toBe('f')
    expect(await ui.find({ key: 'rate:1' })).toBeUndefined()
    await ui.press({ key: 'flip' })
    expect(await ui.find({ key: 'flip' })).toBeUndefined()
    expect((await ui.find({ key: 'answer' }))?.text).toBe('Answer c1.')
    expect(await ui.find({ text: 'repo · docs/spec/a.md' })).toBeDefined()
    expect((await ui.find({ key: 'rate:1' }))?.props.hotkey).toBe('1')
    expect((await ui.find({ key: 'rate:2' }))?.props.hotkey).toBe('2')
    expect((await ui.find({ key: 'rate:3' }))?.props.hotkey).toBe('3')
  })

  test('the answer is drawn at most 10000 characters', async ($, on) => {
    const ui = await mountWith(on, $, deckOf(card('c1', 'y'.repeat(20000))))
    await ui.press({ key: 'flip' })
    expect((await ui.find({ key: 'answer' }))!.text.length).toBeLessThanOrEqual(10000)
  })

  test('with no card dealt there is no flip button to press', async ($, on) => {
    const ui = await mountWith(on, $, null)
    expect(await ui.find({ key: 'flip' })).toBeUndefined()
  })
})
