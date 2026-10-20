import { expect, test } from 'claude-code/testing'
import { BAND, handlerOf, nodesOf, stringsIn } from './fixtures/band.ts'
import { BENEATH, NOW, RUNS, SESSION, dir, file, kitWorld } from './fixtures/world.ts'

const row = (over: object) => ({ name: 'inline-help', state: 'running', title: 'Add a login form', plan: { done: 2, total: 5 }, tools: 0, cost: 5.7291, seconds: 125, ...over })

// The band's own $: the board atom is the given value, and the drawing calls build plain nodes.
const fake = (board: unknown) => ({
  state: { get: async () => ({ value: board, version: 1 }) },
  clock: { now: async () => NOW },
  ui: {
    resolve: async () => ({ Box: (props: object) => ({ type: 'Box', props }), Text: (props: object) => ({ type: 'Text', props }) }),
  },
})

async function drawn(board: object) {
  const handler = handlerOf('ui.render', { component: 'AbovePrompt' })
  return handler(fake(board), BAND, async () => BENEATH)
}

test('BandLayout T1 the header and the live row read as approved, with the beneath layer last', async () => {
  const tree = await drawn({ rows: [row({})], collect: 1 })
  const strings = stringsIn(tree)
  expect(strings).toContain('muster')
  expect(strings).toContain(' · 1 running · 1 to collect')
  expect(strings).toEqual(expect.arrayContaining(['inline-help', 'running', 'Add a login form', '2/5', '2m', '  $5.7']))
  expect((tree.props?.children ?? tree.children).at(-1)).toEqual(BENEATH)
})

test('BandLayout T2 a question, a running, a starting and an idle run each get their label and color', async () => {
  const tree = await drawn({
    rows: [row({ name: 'a', state: 'question' }), row({ name: 'b', state: 'running' }), row({ name: 'c', state: 'starting' }), row({ name: 'd', state: 'idle' })],
    collect: 0,
  })
  const labels = nodesOf(tree, 'Text').filter((node) => node.props?.color !== undefined)
  expect(labels.map((node) => [stringsIn(node).join(''), node.props.color])).toEqual([
    ['? question', 'warning'],
    ['running', 'suggestion'],
    ['starting', 'inactive'],
    ['idle', 'permission'],
  ])
})

test('BandLayout T3 progress without a plan is a dim tool count and a plan is not dimmed', async () => {
  const tree = await drawn({ rows: [row({ name: 'a', plan: null, tools: 12 }), row({ name: 'b' })], collect: 0 })
  const progress = nodesOf(tree, 'Text').filter((node) => ['12 tools', '2/5'].includes(stringsIn(node).join('')))
  expect(progress[0].props.dimColor).toBe(true)
  expect(progress[1].props?.dimColor).toBeUndefined()
})

test('BandLayout T4 the row is laid out in fixed columns with truncating texts and a dim elapsed', async () => {
  const tree = await drawn({ rows: [row({})], collect: 0 })
  const rowBox = nodesOf(tree, 'Box').find((node) => node.props?.columnGap === 2)
  expect(rowBox).toBeDefined()
  expect(rowBox.props.children.slice(0, 4).map((cell: any) => cell.props.width)).toEqual([14, 10, 36, 10])
  const texts = nodesOf(rowBox, 'Text')
  expect(texts.find((node) => stringsIn(node).join('') === 'inline-help').props.wrap).toBe('truncate-end')
  expect(texts.find((node) => stringsIn(node).join('') === 'Add a login form').props.wrap).toBe('truncate-end')
  expect(nodesOf(rowBox, 'Text').find((node) => stringsIn(node).join('') === '2m')?.props.dimColor).toBe(true)
  const header = nodesOf(tree, 'Text').find((node) => stringsIn(node).join('').startsWith('muster'))
  expect(header.props.children[0].props.weight).toBe('bold')
})

test('BandLayout T5 the rows appear in the order of the board', async () => {
  const tree = await drawn({ rows: [row({ name: 'first' }), row({ name: 'second' })], collect: 0 })
  const names = nodesOf(tree, 'Box').filter((node) => node.props?.columnGap === 2).map((node) => stringsIn(node)[0])
  expect(names).toEqual(['first', 'second'])
})

test('BandLayout R1 a title with control characters or 11000 characters still draws the band, cleaned and capped', async () => {
  const tree = await drawn({ rows: [row({ name: 'ok\rname', title: 'ok\rbad\u001b[31m' }), row({ name: 'long', title: 'x'.repeat(11000) })], collect: 0 })
  expect(tree).not.toEqual(BENEATH)
  expect((tree.props?.children ?? tree.children).at(-1)).toEqual(BENEATH)
  const strings = stringsIn(tree)
  expect(strings.some((text) => /[\u0000-\u001f\u007f]/.test(text))).toBe(false)
  expect(strings.some((text) => text.length > 10000)).toBe(false)
  expect(strings).toContain('okbad[31m')
})

test('BandLayout R2 the four fixed-width cells do not shrink, so the columns line up across rows', async () => {
  const tree = await drawn({ rows: [row({ name: 'a', seconds: 5484, cost: 12.3 }), row({ name: 'b', seconds: 120, cost: null })], collect: 0 })
  const rowBoxes = nodesOf(tree, 'Box').filter((node) => node.props?.columnGap === 2)
  expect(rowBoxes).toHaveLength(2)
  for (const rowBox of rowBoxes) {
    const cells = rowBox.props.children.slice(0, 4)
    expect(cells.map((cell: any) => cell.props.width)).toEqual([14, 10, 36, 10])
    expect(cells.map((cell: any) => cell.props.flexShrink)).toEqual([0, 0, 0, 0])
  }
})

test('BandLayout R4 the trailing elapsed and cost text truncates at the end, so a row stays one line', async () => {
  const tree = await drawn({ rows: [row({ seconds: 5484, cost: 12.3 })], collect: 0 })
  const rowBox = nodesOf(tree, 'Box').find((node) => node.props?.columnGap === 2)
  const trailing = rowBox.props.children.at(-1)
  expect(trailing.props.wrap).toBe('truncate-end')
  expect(stringsIn(trailing).join('')).toBe('1h31m  $12.3')
})

for (const title of ['ok\rbad\u001b[31m', 'x'.repeat(11000), 'Fix\u0085 the parser', 'a\u009b31mb', 'a\u0080b']) {
  test(`BandLayout R1 and R3 a run titled ${JSON.stringify(title.slice(0, 20))} still draws through the engine's own tree check`, async ($, on) => {
    const RUN = `${RUNS}/r`
    kitWorld(on, {
      dirs: { [RUNS]: [dir('r')], [RUN]: [file('phase.json')] },
      files: { [`${RUN}/meta.json`]: JSON.stringify({ name: 'r', repoRoot: '/r', started: new Date(NOW - 125000).toISOString() }), [`${RUN}/phase.json`]: JSON.stringify({ phase: 'running', title }) },
    })
    await $.session.start(SESSION)
    const ui = await $.ui.mount({ plugin: 'muster', surface: 'terminal', component: 'AbovePrompt', props: BAND.props } as any)
    expect(await ui.find({ type: 'Text', text: /muster/ } as any)).toBeDefined()
    await ui.unmount()
  })
}
