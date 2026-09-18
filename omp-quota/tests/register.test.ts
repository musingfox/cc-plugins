import { expect, test } from 'claude-code/testing'
import { SESSION, world } from './fixtures/world.ts'

test('session start passes through to the engine', async ($, on) => {
  world(on)
  expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
})
