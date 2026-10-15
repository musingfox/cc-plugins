import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import type { Card, Deck } from '../types'
import { cards, paneProps, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('Flashcards')

function card(id: string): Card {
  return { id, sourcePath: 'docs/spec/a.md', sourceHash: 'h', kind: 'rule', q: `Question ${id}?`, a: `Answer ${id}.`, quote: 'Rules must hold.' }
}

const deckOf = (...items: Card[]): Deck => ({ v: 1, sources: { 'docs/spec/a.md': { hash: 'h', type: 'spec' } }, cards: items })

async function mountWith(on: any, $: any, store: Record<string, unknown>) {
  const seen = world(on, { store })
  await $.session.start(SESSION)
  await $.command.run(cards())
  const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: PANE_PROPS })
  return { seen, ui }
}

describe('q closes the review pane', () => {
  test('the close key is q and closes the cards pane', async ($, on) => {
    const key = await repoKey('/work')
    const { seen, ui } = await mountWith(on, $, { [`deck:${key}`]: deckOf(card('c1')) })
    expect((await ui.find({ key: 'close' }))?.props.hotkey).toBe('q')
    await ui.press({ key: 'close' })
    expect(seen.closed).toContainEqual(expect.objectContaining({ id: 'cards' }))
  })

  test('the pane opens without closeOnEscape, so Esc is left to the engine', async ($, on) => {
    const key = await repoKey('/work')
    const { seen } = await mountWith(on, $, { [`deck:${key}`]: deckOf(card('c1')) })
    expect(seen.opened).toHaveLength(1)
    expect(seen.opened[0]).not.toHaveProperty('closeOnEscape')
  })

  test('the close key is on the empty screen', async ($, on) => {
    const { ui } = await mountWith(on, $, {})
    expect(await ui.find({ key: 'close' })).toBeDefined()
  })

  test('the close key is on the card screen', async ($, on) => {
    const key = await repoKey('/work')
    const { ui } = await mountWith(on, $, { [`deck:${key}`]: deckOf(card('c1')) })
    expect(await ui.find({ key: 'close' })).toBeDefined()
  })

  test('the close key is on the done screen', async ($, on) => {
    const key = await repoKey('/work')
    const { ui } = await mountWith(on, $, { [`deck:${key}`]: deckOf(card('c1')) })
    await ui.press({ key: 'flip' })
    await ui.press({ key: 'rate:3' })
    expect(await ui.find({ text: /這輪複習完 1 張/ })).toBeDefined()
    expect(await ui.find({ key: 'close' })).toBeDefined()
  })
})
