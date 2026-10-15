import { describe, expect, test } from 'claude-code/testing'
import { cards, SESSION, world } from './fixtures/world.ts'

describe('/cards command', () => {
  test('registers an immediate command with the build argument hint', async ($, on) => {
    const seen = world(on)
    await $.session.start(SESSION)
    expect(seen.commands).toContainEqual(expect.objectContaining({ name: 'cards', immediate: true, argumentHint: '[build]' }))
  })

  test('an unknown argument toasts the usage and opens no pane', async ($, on) => {
    const seen = world(on)
    await $.session.start(SESSION)
    expect(await $.command.run(cards('frobnicate'))).toEqual({})
    expect(seen.toasts).toEqual(['usage: /cards [build]'])
    expect(seen.opened).toEqual([])
  })

  test('a refused command registration does not stop the plugin loading', async ($, on) => {
    world(on, { registerDeny: true })
    await expect($.session.start(SESSION)).resolves.toBeDefined()
  })

  test('a blank argument is the review route, not a usage error', async ($, on) => {
    const seen = world(on)
    await $.session.start(SESSION)
    expect(await $.command.run(cards('  '))).toEqual({})
    expect(seen.toasts).toEqual([])
  })
})
