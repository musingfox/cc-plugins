import { expect, test } from 'claude-code/testing'
import { CONFIG, SESSION, evalPayload, kindOf, world } from './fixtures/world.ts'
import { tickAc } from '../hooks/pm-tools.ts'

// The tool answers with one JSON line in `result`; `body` reads it back as the object the tests compare.
const body = (r: any) => JSON.parse(r.result)

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
const refused = (result: any) => expect(body(result).ok).toBe(false)

test('a bad card name is refused with a reason and no CLI run', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO } })
  await $.session.start(SESSION)
  for (const card of ['', '.', '..', 'a/b', 'a\u0000', 123, undefined]) {
    const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card, index: 1, checked: true } as any)
    refused(result)
    expect(result.isError).toBe(true)
    expect(body(result).reason.length).toBeGreaterThan(0)
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

test('a valid call acts on the vault and project the cwd config names', async ($, on) => {
  const w = world(on, { files: { '/work/.obsidian.yaml': 'vault: Work\npm:\n  project: proj-x\n' }, cards: { 'pm/proj-x/tasks/a.md': TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 2, checked: true } as any)
  expect(w.runs[0].argv).toEqual(['obsidian', 'vault=Work', 'read', 'path=pm/proj-x/tasks/a.md'])
  expect(evalPayload(w.runs[1].argv).path).toBe('pm/proj-x/tasks/a.md')
  expect(body(result)).toEqual({ ok: true, path: 'pm/proj-x/tasks/a.md' })
})

test('a cwd below the config resolves the ancestor values', async ($, on) => {
  const w = world(on, { cwd: '/work/sub', files: { '/work/.obsidian.yaml': CONFIG }, cards: { 'pm/cc-plugins/tasks/a.md': TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 2, checked: true } as any)
  expect(w.runs[0].argv).toEqual(['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/a.md'])
  expect(evalPayload(w.runs[1].argv).path).toBe('pm/cc-plugins/tasks/a.md')
  expect(body(result).path).toBe('pm/cc-plugins/tasks/a.md')
})

test('no .obsidian.yaml in the cwd or above refuses with no CLI run', async ($, on) => {
  const w = world(on, { files: {} })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(false)
  expect(body(result).reason).toContain('No .obsidian.yaml')
  expect(result.isError).toBe(true)
  expect(w.runs).toHaveLength(0)
})

test('a config without pm.project refuses with no CLI run', async ($, on) => {
  const w = world(on, { files: { '/work/.obsidian.yaml': 'vault: obsidian\n' } })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result)).toEqual({ ok: false, reason: '/work/.obsidian.yaml has no pm.project.' })
  expect(w.runs).toHaveLength(0)
})

const stored = (w: any) => w.cards[P]

test('a tick reads, writes and reads back the transformed card', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 2, checked: true } as any)
  const text = (tickAc(TWO, 2, true) as { text: string }).text
  expect(body(result)).toEqual({ ok: true, path: P })
  expect(verbs(w)).toEqual(['read', 'eval', 'read'])
  expect(w.runs[0].argv).toEqual(['obsidian', 'vault=obsidian', 'read', `path=${P}`])
  expect(evalPayload(w.runs[1].argv)).toEqual({ path: P, text })
  expect(stored(w)).toBe(text)
})

test('a note appends its bullet to the stored card', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_note', card: 'a', line: '完成 API 重構' } as any)
  expect(body(result).ok).toBe(true)
  expect(stored(w).endsWith('## Notes\n- 完成 API 重構\n')).toBe(true)
})

test('a status change replaces only the status line in the stored card', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_status', card: 'a', status: 'in-progress' } as any)
  expect(body(result).ok).toBe(true)
  expect(stored(w)).toBe(TWO.replace('status: todo', 'status: in-progress'))
})

test('every CLI run is a read or an eval, and none carries content=', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store' })
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(verbs(w).every((verb: string) => verb === 'read' || verb === 'eval')).toBe(true)
  expect(w.runs.flatMap((run: any) => run.argv).some((element: string) => element.startsWith('content='))).toBe(false)
})

test('the result never carries the card text', async ($, on) => {
  world(on, { cards: { [P]: TWO.replace('# t', '# t\nTOPSECRET-MARK') }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(true)
  expect(JSON.stringify(result)).not.toContain('TOPSECRET-MARK')
})

test('a 60,000-character CJK card is written as the transform gives it', async ($, on) => {
  const card = `---\ntitle: t\nstatus: todo\n---\n# t\n\n${'字'.repeat(60000)}\n\n## Acceptance Criteria\n- [ ] one\n`
  const w = world(on, { cards: { [P]: card }, eval: 'store' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(true)
  expect(stored(w)).toBe((tickAc(card, 1, true) as { text: string }).text)
})

test('a read answering the CLI error text fails with that text, no eval', async ($, on) => {
  const w = world(on, { cards: {} })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(false)
  expect(body(result).reason).toContain('not found')
  expect(verbs(w)).toEqual(['read'])
})

test('a read that exits 1 fails with its stderr, no eval', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, reads: { [P]: { exitCode: 1, stdout: '', stderr: 'Obsidian is not running' } } })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result)).toEqual({ ok: false, reason: 'Obsidian is not running' })
  expect(verbs(w)).toEqual(['read'])
})

test('a denied read says the CLI did not run, no eval', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, reads: { [P]: { deny: 'no' } } })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(false)
  expect(body(result).reason.startsWith('The obsidian CLI did not run')).toBe(true)
  expect(verbs(w)).toEqual(['read'])
})

test('an eval answering an ERR line fails with no read back', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: '=> ERR card not found: x\n' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(false)
  expect(verbs(w)).toEqual(['read', 'eval'])
})

test('an eval that exits 1 fails with its stderr', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: { exitCode: 1, stdout: '=> OK\n', stderr: 'boom' } })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result)).toEqual({ ok: false, reason: 'boom' })
  expect(verbs(w)).toEqual(['read', 'eval'])
})

test('an OK eval that stores nothing fails at the read back, with no fourth run', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: '=> OK\n' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(false)
  expect(body(result).reason).toMatch(/read back|read-back/)
  expect(verbs(w)).toEqual(['read', 'eval', 'read'])
})

test('an OK eval that stores half the text fails at the read back', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store-half' })
  await $.session.start(SESSION)
  const result: any = await $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any)
  expect(body(result).ok).toBe(false)
  expect(body(result).reason).toMatch(/read back|read-back/)
  expect(verbs(w)).toEqual(['read', 'eval', 'read'])
})

test('calls issued together each keep the other edit', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const [first, second]: any[] = await Promise.all([
    $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any),
    $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 2, checked: true } as any),
  ])
  expect(body(first).ok).toBe(true)
  expect(body(second).ok).toBe(true)
  expect(stored(w)).toBe(TWO.replace('- [ ] one', '- [x] one').replace('- [ ] 二', '- [x] 二'))
  expect(verbs(w)).toEqual(['read', 'eval', 'read', 'read', 'eval', 'read'])
})

test('a failing call settles alone and the next queued call still runs', async ($, on) => {
  const w = world(on, { cards: { [P]: TWO }, eval: 'store' })
  await $.session.start(SESSION)
  const [missing, valid]: any[] = await Promise.all([
    $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'zz', index: 1, checked: true } as any),
    $.tool.call({ tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true } as any),
  ])
  expect(body(missing).ok).toBe(false)
  expect(body(valid).ok).toBe(true)
  expect(verbs(w)).toEqual(['read', 'read', 'eval', 'read'])
})

test('a read of a card without frontmatter keeps the card text out of the reason', async ($, on) => {
  const w = world(on, { cards: {}, reads: { [P]: '# t\n\n## Acceptance Criteria\n- [ ] SECRETCARDTEXT\n' } })
  await $.session.start(SESSION)
  for (const call of [
    { tool: 'mcp__obw__pm_tick', card: 'a', index: 1, checked: true },
    { tool: 'mcp__obw__pm_note', card: 'a', line: 'n' },
    { tool: 'mcp__obw__pm_status', card: 'a', status: 'done' },
  ]) {
    const result: any = await $.tool.call(call as any)
    expect(body(result).ok).toBe(false)
    expect(result.isError).toBe(true)
    expect(body(result).reason).toContain('did not return a card')
    expect(JSON.stringify(result)).not.toContain('SECRETCARDTEXT')
  }
  expect(verbs(w)).toEqual(['read', 'read', 'read'])
})
