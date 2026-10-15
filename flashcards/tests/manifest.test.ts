import { describe, expect, test } from 'claude-code/testing'
import { cards, paneProps, SESSION, world } from './fixtures/world.ts'

describe('manifest', () => {
  test('the plugin loads under the name flashcards: its review pane mounts', async ($, on) => {
    world(on, {})
    await $.session.start(SESSION)
    await $.command.run(cards())
    const ui = await $.ui.mount({ plugin: 'flashcards', surface: 'terminal', component: 'Pane', requestId: 'cards', props: paneProps('Flashcards') })
    expect(await ui.find({ text: '這個 repo 還沒有牌組。先跑 /cards build。' })).toBeDefined()
  })
})
