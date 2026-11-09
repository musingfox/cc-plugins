import { describe, expect, test } from 'claude-code/testing'
import { MERMAID_CARD, DIAGRAM, ALL_TASKS_ARGV, CARD, SESSION, world } from './fixtures/world.ts'
import { PANE, buttonsIn, headerIn, issue, nodesOf, openFirstRow, pick, press, pressKey, rowKeys, runsOf, shown, stringsIn, vizWorld, watchState } from './fixtures/pane.ts'
import { MIX, P } from './fixtures/rows.ts'
import { groupKey, isListKey, rowKey } from '../hooks/list.ts'
import { QUERY_KEY, refreshTarget } from '../hooks/ring.ts'

const TICK_MS = 5000
const ROWS = JSON.stringify(MIX)
const rowsWithout = (name: string) => JSON.stringify(MIX.filter((row) => row.path !== P(name)))
const rowsWith = (name: string) => JSON.stringify([...MIX, { path: P(name), status: 'todo', priority: 'high' }])

// One timer period on the mock clock, with the tick's reads and writes settled.
async function tick(w: any) {
  await w.clock.advance(TICK_MS)
  await w.clock.settle()
}

// The keys of the list the pane draws now, in drawing order.
const drawnKeys = (tree: any) => buttonsIn(tree).map((node: any) => node.props.key).filter(isListKey)

const mix = (on: any, options: any = {}) => world(on, { query: ROWS, ...options })

describe('timer (clauses 1-4)', () => {
  test('1: /issue starts one timer and a second /issue leaves exactly one', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const before = runsOf(w, 'base:query').length
    await tick(w)
    expect(runsOf(w, 'base:query')).toHaveLength(before + 1)
    expect(runsOf(w, 'base:query').at(-1).argv).toEqual(ALL_TASKS_ARGV)
    await tick(w)
    expect(runsOf(w, 'base:query')).toHaveLength(before + 2)
  })

  test('2: a tick finding the pane closed cancels the timer and runs no CLI command', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await w.clock.settle()
    w.panes.length = 0
    const before = w.runs.length
    await tick(w)
    expect(w.runs).toHaveLength(before)
    w.panes.push('obw-issue')
    await tick(w)
    await tick(w)
    expect(w.runs).toHaveLength(before)
  })

  test('3: session.start cancels a timer a reload left', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await w.clock.settle()
    await $.session.start(SESSION)
    const before = w.runs.length
    await tick(w)
    expect(w.runs).toHaveLength(before)
  })

  test('4: a tick that fires while the previous refresh is pending is skipped', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await w.clock.settle()
    const before = runsOf(w, 'base:query').length
    w.answers['base:query'] = 'defer'
    await tick(w)
    await tick(w)
    await tick(w)
    expect(runsOf(w, 'base:query')).toHaveLength(before + 1)
    w.release(w.runs.length - 1, rowsWith('k'))
    await w.clock.settle()
    expect(rowKeys(await $.ui.render(PANE))).toContain(rowKey(P('k')))
    w.answers['base:query'] = ROWS
    await tick(w)
    expect(runsOf(w, 'base:query')).toHaveLength(before + 2)
  })

  test('4: a panes() that rejects runs no command and throws nothing', async ($, on) => {
    const w = mix(on, { panes: { deny: 'no panes' } })
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    const before = { runs: w.runs.length, writes: state.writes.pane.length }
    await tick(w)
    expect(w.runs).toHaveLength(before.runs)
    expect(state.writes.pane).toHaveLength(before.writes)
    expect(rowKeys(await $.ui.render(PANE)).length).toBeGreaterThan(0)
  })
})

describe('what a tick reads (clauses 5-7)', () => {
  test('5: a tick runs nothing while the pane is loading', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const before = runsOf(w, 'base:query').length
    expect(before).toBe(1)
    await w.clock.advance(TICK_MS)
    expect(runsOf(w, 'base:query')).toHaveLength(before)
    await w.clock.advance(60000)
    await done
  })

  test('5: a tick runs nothing while the pane has no scope', async ($, on) => {
    const w = world(on, { files: {} })
    await issue($, '')
    await w.clock.settle()
    const before = w.runs.length
    await tick(w)
    expect(w.runs).toHaveLength(before)
  })

  test('6: a tick rereads the chosen view and redraws the list, and does not reread the views', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await w.clock.settle()
    const views = runsOf(w, 'views').length
    w.answers['base:query'] = rowsWith('k')
    await tick(w)
    expect(rowKeys(await $.ui.render(PANE))).toContain(rowKey(P('k')))
    expect(runsOf(w, 'views')).toHaveLength(views)
    w.answers['base:query'] = rowsWithout('b')
    await tick(w)
    expect(rowKeys(await $.ui.render(PANE))).not.toContain(rowKey(P('b')))
  })

  test('6: a tick under an open card refreshes the rows the list shows after back', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    expect(state.latest('pane').trail).toHaveLength(1)
    w.answers['base:query'] = rowsWith('k')
    await tick(w)
    expect(state.latest('pane').allTasks.groups.flatMap((group: any) => group.rows.map((row: any) => row.path))).toContain(P('k'))
    expect(state.latest('pane').cards.map((card: any) => card.path)).toContain(P('k'))
    await pressKey($, w, 'back')
    expect(rowKeys(await $.ui.render(PANE))).toContain(rowKey(P('k')))
  })

  test('6: a tick redraws the empty and outside notices', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await w.clock.settle()
    w.answers['base:query'] = '[]'
    await tick(w)
    expect(stringsIn(await $.ui.render(PANE))).toContain('No cards in the All Tasks view of pm/cc-plugins.')
    w.answers['base:query'] = JSON.stringify([{ path: P('a'), status: 'todo' }, { path: 'pm/other/tasks/x.md', status: 'todo' }])
    await tick(w)
    expect(stringsIn(await $.ui.render(PANE))).toContain('1 row of the All Tasks view is not a card under pm/cc-plugins and was left out.')
    w.answers['base:query'] = JSON.stringify([{ path: P('a'), status: 'todo' }])
    await tick(w)
    expect(stringsIn(await $.ui.render(PANE))).not.toContain('1 row of the All Tasks view is not a card under pm/cc-plugins and was left out.')
  })

  test('7: a tick rereads an open card and keeps its browser line and send failure line', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    await pressKey($, w, 'work')
    expect(state.latest('pane').card.workLine).not.toBeNull()
    const kept = state.latest('pane').card.workLine
    const changed = CARD.replace('status: todo', 'status: done').replace('priority: medium', 'priority: high').replace('tags:\n', 'parent: "[[p]]"\ntags:\n')
    w.answers.read = changed
    await tick(w)
    const shown = state.latest('pane').card
    expect(shown.header).toMatchObject({ status: 'done', priority: 'high' })
    expect(shown.relations.parent).toEqual(['p'])
    expect(shown.workLine).toEqual(kept)
    const header = headerIn(await $.ui.render(PANE))
    expect(stringsIn(header).join('')).toContain('status: done · priority: high')
  })

  test('7: a tick keeps the browser state of the card', async ($, on) => {
    const w = vizWorld(on)
    const state = watchState(on)
    await shown($, w, 'a')
    await press($, w)
    const browser = state.latest('pane').card.browser
    expect(browser.kind).toBe('opened')
    w.answers.read = CARD.replace('status: todo', 'status: done')
    await tick(w)
    expect(state.latest('pane').card.header.status).toBe('done')
    expect(state.latest('pane').card.browser).toEqual(browser)
  })
})

describe('keeping what the person is doing (clauses 8-11)', () => {
  test('8: a tick never writes the loading state or numbers a request', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    const { request } = state.latest('pane')
    const before = state.writes.pane.length
    w.answers['base:query'] = rowsWith('k')
    w.answers.read = CARD.replace('status: todo', 'status: done')
    await tick(w)
    const written = state.writes.pane.slice(before)
    expect(written.length).toBeGreaterThan(0)
    for (const write of written) {
      expect(write.value.request).toBe(request)
      expect(write.value.loading).toBe(false)
    }
  })

  test('8: a list read that settles after a view pick is dropped', async ($, on) => {
    const w = mix(on, { query: JSON.stringify([{ path: P('a'), status: 'todo' }]) })
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    w.answers['base:query'] = 'defer'
    await tick(w)
    const slow = w.runs.length - 1
    w.answers['base:query'] = JSON.stringify([{ path: P('b'), status: 'todo' }])
    await pick($, w, 'views', 'Active')
    const requested = state.latest('pane').request
    expect(state.latest('pane').cards.map((card: any) => card.path)).toEqual([P('b')])
    w.release(slow, rowsWith('k'))
    await w.clock.settle()
    expect(state.latest('pane').request).toBe(requested)
    expect(state.latest('pane').cards.map((card: any) => card.path)).toEqual([P('b')])
  })

  test('8: a card read that settles after a card open is dropped', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    const [first] = state.latest('pane').trail
    w.answers.read = 'defer'
    await tick(w)
    const slow = w.runs.length - 1
    w.answers.read = CARD.replace('title: "Claude Mod：面板顯示 obw 的 task 與 issue"', 'title: second')
    await pressKey($, w, 'back')
    const other = rowKeys(await $.ui.render(PANE)).find((key) => key !== rowKey(first))!
    await pressKey($, w, other)
    expect(state.latest('pane').card.header.title).toBe('second')
    w.release(slow, CARD.replace('status: todo', 'status: done'))
    await w.clock.settle()
    expect(state.latest('pane').card.header.title).toBe('second')
    expect(state.latest('pane').card.header.status).toBe('todo')
  })

  test('9: a tick whose reads equal what the pane holds writes nothing', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    const before = { pane: state.writes.pane.length, list: state.writes.list.length, ring: state.writes.ring.length }
    const redraws = w.invalidates
    await tick(w)
    await tick(w)
    expect(state.writes.pane).toHaveLength(before.pane)
    expect(state.writes.list).toHaveLength(before.list)
    expect(state.writes.ring).toHaveLength(before.ring)
    expect(w.invalidates).toBe(redraws)
  })

  test('9: nor does a tick under an open card whose card is unchanged', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    const before = state.writes.pane.length
    await tick(w)
    expect(state.writes.pane).toHaveLength(before)
  })

  test('10: a tick leaves the filter, sort, folds and the trail alone', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await pressKey($, w, 'sort')
    await pressKey($, w, 'priority')
    const settings = state.latest('list')
    const written = state.writes.list.length
    w.answers['base:query'] = rowsWith('k')
    await tick(w)
    expect(state.latest('list')).toEqual(settings)
    expect(state.writes.list).toHaveLength(written)
    const [first] = rowKeys(await $.ui.render(PANE))
    await pressKey($, w, first)
    const trail = state.latest('pane').trail
    w.answers['base:query'] = rowsWith('m')
    await tick(w)
    expect(state.latest('pane').trail).toEqual(trail)
    expect(state.writes.list).toHaveLength(written)
  })
})

describe('the ring after a list change (clause 11)', () => {
  const items = [groupKey(0, 'todo'), rowKey('a'), rowKey('b')]

  // The kit refuses a focus the plugin asks for, so which key a refresh asks for is a table; the tick's own write is asserted below.
  test('11: the ring stays on its row while that row is drawn', () => {
    expect(refreshTarget(rowKey('b'), items)).toBe(rowKey('b'))
    expect(refreshTarget(groupKey(0, 'todo'), items)).toBe(groupKey(0, 'todo'))
  })

  test('11: the ring goes to the first drawn item when its row is gone', () => {
    expect(refreshTarget(rowKey('c'), items)).toBe(groupKey(0, 'todo'))
    expect(refreshTarget(groupKey(0, 'done'), items)).toBe(groupKey(0, 'todo'))
  })

  test('11: a ring off the list stays, and an empty list asks for nothing', () => {
    expect(refreshTarget(null, items)).toBeNull()
    expect(refreshTarget(QUERY_KEY, items)).toBeNull()
    expect(refreshTarget('sort', items)).toBeNull()
    expect(refreshTarget(rowKey('a'), [])).toBeNull()
  })

  test('11: a refused focus is not an error: the list change still lands and no failure line is left', async ($, on) => {
    const w = mix(on)
    on('ui.focus', () => ({ value: undefined }))
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    await $.ui.render(PANE)
    await $.ui.focus({ requestId: 'obw-issue', element: rowKey(P('a')) })
    w.answers['base:query'] = rowsWithout('a')
    await tick(w)
    expect(state.latest('pane').cards.map((card: any) => card.path)).not.toContain(P('a'))
    expect(rowKeys(await $.ui.render(PANE))).not.toContain(rowKey(P('a')))
    expect(state.latest('pane').refreshLine).toBeNull()
  })
})

describe('diagrams under a refresh (clause 12)', () => {
  const cardOf = (source: string) => `---\ntitle: m\n---\n# m\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\ntail\n`
  const NEW = ' ┌─┐\n │N│\n └─┘'
  const lastUvx = (w: any) => w.runs.map((run: any) => run.argv[0]).lastIndexOf('uvx')

  test('12: a body that changes restarts its diagrams for the new body', async ($, on) => {
    const w = mix(on, { read: MERMAID_CARD })
    const state = watchState(on)
    await openFirstRow($, w)
    expect(state.latest('pane').card.diagrams).toEqual([null, DIAGRAM.trimEnd(), null])
    w.answers.read = cardOf('graph LR\nC-->D')
    w.answers.termaid = NEW
    await tick(w)
    const { card } = state.latest('pane')
    expect(card.segments).toHaveLength(3)
    expect(card.diagrams).toEqual([null, NEW, null])
    expect(nodesOf(await $.ui.render(PANE), 'Code').map((node: any) => node.props.source)).toEqual([NEW])
  })

  test('12: a body that does not change keeps its drawn diagrams and starts none', async ($, on) => {
    const w = mix(on, { read: MERMAID_CARD })
    const state = watchState(on)
    await openFirstRow($, w)
    const before = { diagrams: state.latest('pane').card.diagrams, uvx: w.runs.filter((run: any) => run.argv[0] === 'uvx').length }
    w.answers.read = MERMAID_CARD.replace('title: m', 'title: renamed')
    await tick(w)
    expect(state.latest('pane').card.header.title).toBe('renamed')
    expect(state.latest('pane').card.diagrams).toEqual(before.diagrams)
    expect(w.runs.filter((run: any) => run.argv[0] === 'uvx')).toHaveLength(before.uvx)
  })

  test('12: a diagram started for an earlier body never lands on a later body', async ($, on) => {
    const w = mix(on, { read: MERMAID_CARD })
    const state = watchState(on)
    await openFirstRow($, w)
    w.answers.termaid = 'defer'
    w.answers.read = cardOf('graph LR\nC-->D')
    await tick(w)
    const stale = lastUvx(w)
    expect(state.latest('pane').card.diagrams).toEqual([null, null, null])
    w.answers.read = cardOf('graph LR\nE-->F')
    await tick(w)
    const current = lastUvx(w)
    expect(current).not.toBe(stale)
    w.release(stale, 'STALE')
    await w.clock.settle()
    expect(state.latest('pane').card.diagrams).toEqual([null, null, null])
    expect(stringsIn(await $.ui.render(PANE))).not.toContain('STALE')
    w.release(current, NEW)
    await w.clock.settle()
    expect(state.latest('pane').card.diagrams).toEqual([null, NEW, null])
  })
})

describe('a failed read (clause 13)', () => {
  const LINE = 'Could not refresh: '
  const lineIn = (tree: any) => nodesOf(tree, 'Text').find((node: any) => stringsIn(node).some((text) => text.startsWith(LINE)))

  test('13: a failed list read keeps the last list and draws one dim line, which the next success removes', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    const keys = rowKeys(await $.ui.render(PANE))
    w.answers['base:query'] = { exitCode: 1, stderr: 'vault is locked\n' }
    await tick(w)
    const tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).toEqual(keys)
    expect(stringsIn(tree).filter((text) => text.startsWith(LINE))).toEqual([`${LINE}vault is locked`])
    expect(lineIn(tree).props.dimColor).toBe(true)
    expect(state.latest('pane').refreshLine).toEqual({ kind: 'notice', text: `${LINE}vault is locked` })
    await tick(w)
    expect(stringsIn(await $.ui.render(PANE)).filter((text) => text.startsWith(LINE))).toHaveLength(1)
    w.answers['base:query'] = rowsWith('k')
    await tick(w)
    const healed = await $.ui.render(PANE)
    expect(lineIn(healed)).toBeUndefined()
    expect(rowKeys(healed)).toContain(rowKey(P('k')))
    expect(state.latest('pane').refreshLine).toBeNull()
  })

  test('13: a rejected run counts as the failure', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await w.clock.settle()
    const keys = rowKeys(await $.ui.render(PANE))
    w.answers['base:query'] = { deny: 'spawn failed' }
    await tick(w)
    const tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).toEqual(keys)
    expect(lineIn(tree)).toBeDefined()
    expect(stringsIn(tree).some((text) => text.startsWith(`${LINE}The obsidian CLI did not run`))).toBe(true)
  })

  test('13: the message is bounded', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    w.answers['base:query'] = { exitCode: 1, stderr: `${'x'.repeat(500)}\u0007` }
    await tick(w)
    expect(state.latest('pane').refreshLine.text).toBe(`${LINE}${'x'.repeat(200)}`)
  })

  test('13: a card that was deleted keeps the last card and counts as the failure', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    const kept = state.latest('pane').card
    w.answers.read = 'Error: File "pm/cc-plugins/tasks/b.md" not found.\n'
    w.answers['base:query'] = rowsWithout('zz')
    await tick(w)
    const tree = await $.ui.render(PANE)
    expect(state.latest('pane').card).toEqual(kept)
    expect(stringsIn(tree).some((text) => text.startsWith(`${LINE}Error: File`))).toBe(true)
    expect(stringsIn(headerIn(tree)).join('')).toContain('status: todo')
    w.answers.read = CARD
    await tick(w)
    expect(lineIn(await $.ui.render(PANE))).toBeUndefined()
  })

  test('13: a failed card read leaves the list read of that tick unwritten', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await openFirstRow($, w)
    const before = state.latest('pane').cards
    w.answers.read = { exitCode: 1, stderr: 'gone' }
    w.answers['base:query'] = rowsWith('k')
    await tick(w)
    expect(state.latest('pane').cards).toEqual(before)
    expect(state.latest('pane').refreshLine.text).toBe(`${LINE}gone`)
  })
})
