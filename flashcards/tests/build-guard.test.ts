import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import { cards, SESSION, world } from './fixtures/world.ts'

const BUSY = 'A flashcards build is already running; wait for its report.'
const MINUTE = 60 * 1000
const SPEC = { files: { '/work/docs/spec/a.md': 'Rule one.\n' }, dirs: { '/work/docs/spec': [{ name: 'a.md', kind: 'file' as const }] } }

describe('/cards build guard', () => {
  test('a second build while one is running is refused with a toast and spawns nothing', async ($, on) => {
    const seen = world(on, SPEC)
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.spawns).toHaveLength(1)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).toEqual([expect.stringContaining('Building flashcards'), BUSY])
    expect(seen.spawns).toHaveLength(1)
  })

  test('after 31 minutes the build starts over', async ($, on) => {
    const seen = world(on, SPEC)
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await seen.clock.advance(31 * MINUTE)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).not.toContain(BUSY)
    expect(seen.spawns.length).toBeGreaterThan(1)
  })

  test('a new session clears the flag, so the next build within 30 minutes is allowed', async ($, on) => {
    const seen = world(on, SPEC)
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).not.toContain(BUSY)
    expect(seen.spawns.length).toBe(2)
  })

  test('a fresh world builds with no refusal', async ($, on) => {
    const seen = world(on, SPEC)
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).not.toContain(BUSY)
  })

  test('a build that stops before spawning does not hold the next one', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { store: { [`deck:${key}`]: 'junk' } })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).toEqual(['Flashcards deck could not be read; build stopped so it is not overwritten.', 'Flashcards deck could not be read; build stopped so it is not overwritten.'])
  })
})
