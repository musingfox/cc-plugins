import { expect, test } from 'claude-code/testing'
import { SESSION, world } from './fixtures/world.ts'

test('session start registers pm_tick, pm_note and pm_status', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  expect(w.tools.map((tool) => tool.name)).toEqual(['pm_tick', 'pm_note', 'pm_status'])
})

test('each tool has its required fields and typed properties', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  const [tick, note, status] = w.tools
  expect(tick.inputSchema.required).toEqual(['card', 'index', 'checked'])
  expect(tick.inputSchema.properties.index.type).toBe('integer')
  expect(tick.inputSchema.properties.checked.type).toBe('boolean')
  expect(tick.inputSchema.properties.card.type).toBe('string')
  expect(note.inputSchema.required).toEqual(['card', 'line'])
  expect(status.inputSchema.required).toEqual(['card', 'status'])
  expect(status.inputSchema.properties.status.enum).toEqual(['todo', 'in-progress', 'blocked', 'done'])
})

test('each tool has a non-empty description of at most 2048 characters and is not deferred', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  for (const tool of w.tools) {
    expect(tool.description.length).toBeGreaterThan(0)
    expect(tool.description.length).toBeLessThanOrEqual(2048)
    expect(tool.isDeferred).toBe(false)
  }
})

test('a refused tool registration leaves /issue and the other tools registered', async ($, on) => {
  const w = world(on, { toolRegister: { deny: 'no' } })
  await $.session.start(SESSION)
  expect(w.registered[0].name).toBe('issue')
  expect(w.tools).toHaveLength(3)
})
