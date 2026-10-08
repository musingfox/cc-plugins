import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, bandRows, handlerOf, nodesOf, stringsIn } from './fixtures/band.ts'
import { BENEATH, ENV, NOW, ROOT, ROOT2, SESSION, ok, openFlow, world } from './fixtures/world.ts'

const first = async ($: any) => (await bandLines($))[0]
const colorOf = (node: any) => node.props?.color ?? node.color

test('ProgressBand T1 an open flow draws one line above what the others drew', async ($, on) => {
  await openFlow($, on)
  const tree = await $.ui.render(BAND)
  expect(await bandLines($)).toEqual(['● cf mod-band · setup · 0m', 'beneath'])
  const dot = nodesOf(tree, 'Text').find((node) => stringsIn(node).join('') === '●')
  expect(colorOf(dot)).toBe('suggestion')
  expect((tree.props?.children ?? tree.children)[0].props?.wrap ?? (tree.props?.children ?? tree.children)[0].wrap).toBe('truncate-end')
})

test('ProgressBand T2 no flow leaves the band to the others', async ($, on) => {
  world(on, { beneath: BENEATH })
  await $.session.start(SESSION)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('ProgressBand T3 a survey keeps the band out of the way', async ($, on) => {
  await openFlow($, on)
  expect(await $.ui.render({ ...BAND, props: { ...BAND.props, hasSurvey: true } })).toEqual(BENEATH)
})

const OPEN_TRACKER = { value: { flow: { root: ROOT, startedAt: NOW, phase: 'setup', since: NOW, waits: [], totals: { setup: 0, research: 0, plan: 0, implement: 0, review: 0, waiting: 0 } }, lastEndedRoot: null }, version: 1 }

function fake(Text: (props: any) => unknown) {
  return {
    state: { get: async (ref: any) => (ref.key === 'tracker' ? OPEN_TRACKER : { value: null, version: 1 }) },
    clock: { now: async () => NOW },
    ui: { resolve: async () => ({ Box: (props: any) => ({ type: 'Box', props }), Text }) },
  }
}

test('ProgressBand T4 a fault while drawing returns what the others drew', async () => {
  const handler = handlerOf('ui.render', { component: 'AbovePrompt' })
  const next = async () => BENEATH
  const throwing = fake(() => {
    throw new Error('boom')
  })
  expect(await handler(throwing, BAND, next)).toEqual(BENEATH)
  // The same fake draws the line when Text does not throw, so the case above reached the draw.
  const drawn = await handler(fake((props: any) => ({ type: 'Text', props })), BAND, next)
  expect(drawn).not.toEqual(BENEATH)
  expect(drawn.props.children[1]).toBe(BENEATH)
})

test('ProgressBand T5 a flow whose env.sh is absent is named by its root directory', async ($, on) => {
  await openFlow($, on, { files: {} })
  expect(await first($)).toBe('● cf cf-1008-Rez6 · setup · 0m')
})

test('ProgressBand T6 the implement phase shows before the first poll', async ($, on) => {
  const { w, bash } = await openFlow($, on)
  bash.answer = ok('')
  await $.tool.call({ tool: 'Bash', command: '"$SCRIPTS/cf-pi-shard.sh" "/tmp/cf-1008-Rez6"' })
  await w.clock.settle()
  expect(await first($)).toBe('● cf mod-band · implement · 0m')
})

test('ElapsedTicks T1 an open flow redraws on every tick', async ($, on) => {
  const { w } = await openFlow($, on)
  const before = w.invalidates
  await w.clock.advance(30_000)
  expect(w.invalidates - before).toBe(3)
})

test('ElapsedTicks T2 no flow, no redraw', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  await w.clock.advance(60_000)
  expect(w.invalidates).toBe(0)
})

test('ElapsedTicks T3 a second session.start does not double the cadence', async ($, on) => {
  const { w } = await openFlow($, on)
  await $.session.start(SESSION)
  await w.clock.settle()
  const before = w.invalidates
  await w.clock.advance(30_000)
  expect(w.invalidates - before).toBe(3)
})

test('ElapsedTicks T4 elapsed moves from minutes to hours and minutes', async ($, on) => {
  const { w } = await openFlow($, on)
  await w.clock.advance(599_000)
  expect((await first($)).endsWith('· 9m')).toBe(true)
  await w.clock.advance(3_301_000)
  expect((await first($)).endsWith('· 1h 5m')).toBe(true)
})

test('FlowNameFromEnv T1 the band names the flow by its slug', async ($, on) => {
  await openFlow($, on)
  expect(await first($)).toContain('mod-band')
})

test('FlowNameFromEnv T2 the last CF_SLUG line wins', async ($, on) => {
  await openFlow($, on, { files: { [`${ROOT}/env.sh`]: 'CF_SLUG="mod-band"\nREPO_ROOT="/r"\nCF_SLUG="mod-band-2"\n' } })
  expect(await first($)).toBe('● cf mod-band-2 · setup · 0m')
})

test('FlowNameFromEnv T3 an absent env.sh falls back to the root directory', async ($, on) => {
  await openFlow($, on, { files: {} })
  expect(await first($)).toBe('● cf cf-1008-Rez6 · setup · 0m')
})

test('FlowNameFromEnv T4 nothing but the slug leaves env.sh', async ($, on) => {
  await openFlow($, on)
  await Promise.all((await bandLines($)).map(async (line) => expect(line).not.toContain('sk-live-SECRET')))
  expect(JSON.stringify(await $.ui.render(BAND))).not.toContain('sk-live-SECRET')
})

const TWO_SHARDS = '{"fan_out_count":2,"groups":{"A":{},"B":{}}}'
const PASSED = '## Status\nPASS\n'

test('ImplementFiguresPolled T1..T2 figures move with the shard files on each poll', async ($, on) => {
  const { w, bash } = await openFlow($, on)
  bash.answer = ok('')
  w.files[`${ROOT}/shards.json`] = TWO_SHARDS
  w.files[`${ROOT}/shards/A/outcome.md`] = PASSED
  w.files[`${ROOT}/loop-budget.json`] = '{"retries_used":0}'
  await $.tool.call({ tool: 'Bash', command: '"$SCRIPTS/cf-pi-shard.sh" "/tmp/cf-1008-Rez6"' })
  await w.clock.advance(10_000)
  expect(await first($)).toBe('● cf mod-band · implement · 1/2 shards · round 1 · 4 retries left · 0m')
  w.files[`${ROOT}/shards/B/outcome.md`] = PASSED
  await w.clock.advance(10_000)
  expect(await first($)).toContain('· 2/2 shards ·')
})

test('ImplementFiguresPolled T3 a budget alone still shows the retries left', async ($, on) => {
  const { w, bash } = await openFlow($, on)
  bash.answer = ok('')
  w.files[`${ROOT}/loop-budget.json`] = '{"retries_used":3}'
  await $.tool.call({ tool: 'Bash', command: '"$SCRIPTS/cf-pi-shard.sh" "/tmp/cf-1008-Rez6"' })
  await w.clock.advance(10_000)
  expect(await first($)).toBe('● cf mod-band · implement · 1 retry left · 0m')
})

test('ImplementFiguresPolled T4 outside implement the shard files are not read', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ({ result: { status: 'async_launched', agentId: 'a1', description: 'd', prompt: 'p', outputFile: '/o' } }))
  const { w } = await openFlow($, on)
  await $.tool.call({ tool: 'Agent', subagent_type: 'cf:research', prompt: 'p', description: 'd' })
  await w.clock.advance(30_000)
  expect(w.readCalls.filter((path) => /(shards|dispatch-state|loop-budget)\.json$/.test(path))).toEqual([])
})

for (const id of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
  test(`ImplementFiguresPolled R1 a shard group named ${id} is counted by its outcome file`, async ($, on) => {
    const { w, bash } = await openFlow($, on)
    bash.answer = ok('')
    w.files[`${ROOT}/shards.json`] = `{"groups":{"${id}":{}}}`
    await $.tool.call({ tool: 'Bash', command: 'cf-pi-shard.sh /tmp/cf-1008-Rez6' })
    await w.clock.advance(10_000)
    expect(await first($)).toBe('● cf mod-band · implement · 0/1 shards · round 1 · 0m')
    w.files[`${ROOT}/shards/${id}/outcome.md`] = PASSED
    w.files[`${ROOT}/dispatch-state.json`] = '{"current_round":1}'
    await w.clock.advance(10_000)
    expect(await first($)).toBe('● cf mod-band · implement · 1/1 shards · round 1 · 0m')
  })
}

test('ImplementFiguresPolled T5 figures of the old root are not drawn under a new one', async ($, on) => {
  const { w, bash } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV, [`${ROOT}/shards.json`]: TWO_SHARDS, [`${ROOT}/shards/A/outcome.md`]: PASSED, [`${ROOT}/loop-budget.json`]: '{"retries_used":0}' } })
  bash.answer = ok('')
  await $.tool.call({ tool: 'Bash', command: '"$SCRIPTS/cf-pi-shard.sh" "/tmp/cf-1008-Rez6"' })
  await w.clock.advance(10_000)
  expect(await first($)).toContain('1/2 shards')
  w.files[`${ROOT2}/env.sh`] = 'defer'
  bash.answer = ok(`SESSION=${ROOT2}\n`)
  await $.tool.call({ tool: 'Bash', command: 'cf setup again' })
  await w.clock.settle()
  bash.answer = ok('')
  await $.tool.call({ tool: 'Bash', command: '"$SCRIPTS/cf-pi-shard.sh" "/tmp/cf-1008-Ab12"' })
  await w.clock.settle()
  expect(await first($)).toBe('● cf cf-1008-Ab12 · implement · 0m')
})
