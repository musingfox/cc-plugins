import { expect, test } from 'claude-code/testing'
import { SESSION, kindOf, world } from './fixtures/world.ts'

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

const P = 'pm/cc-plugins/tasks/a.md'
const TWO = '---\ntitle: t\nstatus: todo\n---\n# t\n\n## Acceptance Criteria\n- [ ] one\n- [ ] 二\n'
const verbs = (w: any) => w.runs.map((run: any) => kindOf(run.argv))
const refused = (result: any) => expect(result.result.ok).toBe(false)

test('a bad card name is refused with a reason and no CLI run', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO } })
  await $.session.start(SESSION)
  for (const card of ['', '.', '..', 'a/b', 'a\u0000', 123, undefined]) {
    const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card, index: 1, checked: true } as any)
    refused(result)
    expect(result.isError).toBe(true)
    expect(result.result.reason.length).toBeGreaterThan(0)
  }
  expect(w.runs).toHaveLength(0)
})

test('a bad tick index or checked value is refused with no CLI run', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO } })
  await $.session.start(SESSION)
  for (const index of [1.5, '1', Number.NaN, undefined]) refused(await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index, checked: true } as any))
  for (const checked of ['true', undefined]) refused(await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked } as any))
  expect(w.runs).toHaveLength(0)
})

test('a bad note line or status value is refused with no CLI run', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO } })
  await $.session.start(SESSION)
  for (const line of ['', 'a\nb', 42]) refused(await $.tool.call({ tool: 'mcp__obw__pm_note', card: 'a', line } as any))
  for (const status of ['finished', 7, 'DONE']) refused(await $.tool.call({ tool: 'mcp__obw__pm_status', card: 'a', status } as any))
  expect(w.runs).toHaveLength(0)
})

test('an out-of-range tick index reads once, writes nothing', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO } })
  await $.session.start(SESSION)
  const before = JSON.stringify(w.cards)
  refused(await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 99, checked: true } as any))
  expect(verbs(w)).toEqual(['read'])
  expect(JSON.stringify(w.cards)).toBe(before)
})

test('a status change on a card with no status line reads once, writes nothing', async ($, on) => {
  const w = world(on, { cards: { [P]: '---\ntitle: x\n---\n# t\n' } })
  await $.session.start(SESSION)
  refused(await $.tool.call({ tool: 'mcp__obw__pm_status', card: 'a', status: 'done' } as any))
  expect(verbs(w)).toEqual(['read'])
})

test('a refusal reason never carries the card text', async ($, on) => {
  world(on, { cards: { [P]: TWO.replace('# t', '# t\nTOPSECRET-MARK') } })
  await $.session.start(SESSION)
  const out = [
    await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 99, checked: true } as any),
    await $.tool.call({ tool: 'mcp__obw__pm_status', card: 'a', status: 'done' } as any),
    await $.tool.call({ tool: 'mcp__obw__pm_note', card: 'a', line: '' } as any),
  ]
  for (const result of out) expect(JSON.stringify(result)).not.toContain('TOPSECRET-MARK')
})

test('a valid call reaches the eval, so the zero-eval refusals above can fail', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO } })
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 2, checked: true } as any)
  expect(verbs(w)).toContain('eval')
})
