import { describe, expect, test } from 'claude-code/testing'
import { PANE, buttonOf, buttonsIn, expectDrawn, headerIn, headingKeys, issue, labelsOf, nodesOf, pick, pressKey, rowKeys, runsOf, stringsIn, uvxRuns, vizWorld } from './fixtures/pane.ts'
import { ALL_TASKS_ARGV, CARD, DASHBOARD_ARGV, DIAGRAM, MERMAID_CARD, SESSION, world } from './fixtures/world.ts'
import { P } from './fixtures/rows.ts'
import { rowKey } from '../hooks/list.ts'
import { BACK_KEY } from '../hooks/ring.ts'

const A = P('a')
const PARENT = 'pm/cc-plugins/tasks/archive/p.md'
const ROWS = JSON.stringify([
  { path: A, status: 'todo', title: 'A' },
  { path: PARENT, status: 'done', title: 'Parent P' },
  { path: P('q'), status: 'todo', title: 'Q' },
])
const RELATED_CARD = '---\ntitle: A\nparent: "[[p]]"\nblocked_by:\n  - "[[q]]"\nrelated: ["[[doc-x]]"]\n---\nbody\n'
const readArgv = (path: string) => ['obsidian', 'vault=obsidian', 'read', `path=${path}`]
const readPaths = (w: any) => runsOf(w, 'read').map((run: any) => run.argv[3].slice('path='.length))
const textOf = (tree: any, text: string) => nodesOf(tree, 'Text').find((node: any) => stringsIn(node).join('') === text)

describe('a card opened from the list', () => {
  test('is read once and drawn in full in place of the list', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const tree = await $.ui.render(PANE)
    expect(runsOf(w, 'read').map((run: any) => run.argv)).toEqual([readArgv(A)])
    expect(headingKeys(tree)).toEqual([])
    expect(nodesOf(tree, 'Markdown').map((node: any) => node.props.text)).toEqual(['# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'])
    expect(nodesOf(tree, 'Text').filter((node: any) => node.props?.bold).map((node: any) => stringsIn(node).join(''))).toEqual(['Claude Mod：面板顯示 obw 的 task 與 issue'])
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium · AC 0/1')
  })

  test('runs termaid for its diagrams', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    expect(uvxRuns(w)).toHaveLength(1)
    expect(nodesOf(await $.ui.render(PANE), 'Code').map((node: any) => node.props.source)).toEqual([DIAGRAM.trimEnd()])
  })

  test('offers Open in browser on the terminal only', async ($, on) => {
    const w = vizWorld(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    expect(buttonOf(await $.ui.render(PANE), 'open-in-browser')).toBeDefined()
    expect(buttonOf(await $.ui.render({ ...PANE, surface: 'desktop' }), 'open-in-browser')).toBeUndefined()
  })

  test('a failed read is an error line under the back Button', async ($, on) => {
    const message = 'Error: File "pm/cc-plugins/tasks/a.md" not found.'
    const w = world(on, { read: message })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const tree = await $.ui.render(PANE)
    expect(textOf(tree, message).props.color).toBe('error')
    expect(buttonOf(tree, BACK_KEY)).toBeDefined()
  })

  test('shows the reading line and back before the read settles', async ($, on) => {
    const w = world(on, { read: 'hang' })
    await issue($, '')
    await $.ui.render(PANE)
    const pressed = $.ui.press({ plugin: 'obw', key: rowKey(A) })
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain('Reading a…')
    expect(buttonOf(tree, BACK_KEY)).toBeDefined()
    await w.clock.advance(60000)
    await pressed
  })
})

describe('the card view', () => {
  test('sits under a breadcrumb and a back Button with no views picker or toolbar', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const tree = await $.ui.render(PANE)
    const crumb = textOf(tree, 'list ›')
    expect(crumb.props.color).toBe('inactive')
    const back = buttonOf(tree, BACK_KEY)
    expect(back.props.hotkey).toBe('b')
    expect(back.props.label).toBe('back')
    expect(back.props.autoFocus).toBe(true)
    expect(back.props.plain).toBe(true)
    expect(nodesOf(tree, 'Select')).toHaveLength(0)
    expect(nodesOf(tree, 'Input')).toHaveLength(0)
    expect(buttonOf(tree, 'priority')).toBeUndefined()
  })

  test('the breadcrumb names every card but the last after a relation press', async ($, on) => {
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD, [PARENT]: CARD } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, `rel:parent:${PARENT}`)
    expect(textOf(await $.ui.render(PANE), 'list › a ›')).toBeDefined()
  })

  test('the hints line is subtle and names tab only for a card with links', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const hints = textOf(await $.ui.render(PANE), '↑↓ scroll · esc or b back')
    expect(hints.props.color).toBe('subtle')
  })

  test('the hints line names tab for a card with links', async ($, on) => {
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    expect(textOf(await $.ui.render(PANE), '↑↓ scroll · tab links · esc or b back')).toBeDefined()
  })

  test('draws the breadcrumb and back before the reading line', async ($, on) => {
    const w = world(on, { read: 'hang' })
    await issue($, '')
    await $.ui.render(PANE)
    const pressed = $.ui.press({ plugin: 'obw', key: rowKey(A) })
    await w.clock.settle()
    const flat = JSON.stringify(await $.ui.render(PANE))
    expect(flat.indexOf('"list ›"')).toBeGreaterThan(-1)
    expect(flat.indexOf('"list ›"')).toBeLessThan(flat.indexOf('"key":"back"'))
    expect(flat.indexOf('"key":"back"')).toBeLessThan(flat.indexOf('Reading a…'))
    await w.clock.advance(60000)
    await pressed
  })
})

describe('relations', () => {
  test('a link to an All Tasks row is a Button and any other link is dim text', async ($, on) => {
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const tree = await $.ui.render(PANE)
    const links = buttonsIn(tree).filter((node: any) => node.props.key.startsWith('rel:'))
    expect(links.map((node: any) => node.props.key)).toEqual([`rel:parent:${PARENT}`, `rel:blocked_by:${P('q')}`])
    expect(labelsOf(links)).toEqual(['Parent P', 'Q'])
    const dangling = textOf(tree, 'doc-x · not in all tasks')
    expect(dangling.props.color).toBe('subtle')
    expect(buttonsIn(tree).some((node: any) => node.props.key.includes('doc-x'))).toBe(false)
  })

  test('pressing a link reads that card through its path', async ($, on) => {
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD, [PARENT]: CARD } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, `rel:parent:${PARENT}`)
    expect(readPaths(w)).toEqual([A, PARENT])
  })

  test('one target named under two fields is two Buttons', async ($, on) => {
    const card = '---\ntitle: A\nparent: "[[q]]"\nrelated: ["[[q]]"]\n---\nbody\n'
    const w = world(on, { query: ROWS, reads: { [A]: card } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const keys = buttonsIn(await $.ui.render(PANE)).map((node: any) => node.props.key).filter((key: string) => key.startsWith('rel:'))
    expect(keys).toEqual([`rel:parent:${P('q')}`, `rel:related:${P('q')}`])
  })

  test('a card with no relation fields draws no link', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    expect(buttonsIn(await $.ui.render(PANE)).some((node: any) => node.props.key.startsWith('rel:'))).toBe(false)
  })

  test('a linked card that cannot be read shows its error under the shortened breadcrumb', async ($, on) => {
    const missing = `Error: File "${PARENT}" not found.`
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD, [PARENT]: missing } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, `rel:parent:${PARENT}`)
    const tree = await $.ui.render(PANE)
    expect(textOf(tree, missing).props.color).toBe('error')
    expect(textOf(tree, 'list › a ›')).toBeDefined()
    expect(buttonOf(tree, BACK_KEY)).toBeDefined()
  })

  test('a relation name with a carriage return or 11000 characters is drawn clean and cut', async ($, on) => {
    const long = `---\ntitle: A\nrelated: ["[[${'y'.repeat(11000)}\r]]"]\n---\nbody\n`
    const w = world(on, { query: ROWS, reads: { [A]: long } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    const tree = await $.ui.render(PANE)
    expectDrawn(tree)
    const dangling = stringsIn(tree).find((text: string) => text.includes('yyyy'))!
    expect(dangling.length).toBeLessThanOrEqual(10000)
    expect(dangling.includes('\r')).toBe(false)
  })

  test('a relation to a row whose title holds a carriage return is labelled without it', async ($, on) => {
    const rows = JSON.stringify([{ path: A, status: 'todo', title: 'A' }, { path: P('q'), status: 'todo', title: 'a\rb' }])
    const w = world(on, { query: rows, reads: { [A]: '---\ntitle: A\nrelated: ["[[q]]"]\n---\nbody\n' } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    expect(buttonOf(await $.ui.render(PANE), `rel:related:${P('q')}`).props.label).toBe('ab')
  })
})

describe('back', () => {
  test('from the first card returns the list and reads nothing more', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, BACK_KEY)
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree).length).toBeGreaterThan(0)
    expect(readPaths(w)).toEqual([A])
  })

  test('from a second card reads the first again and keeps the breadcrumb root', async ($, on) => {
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD, [PARENT]: CARD } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, `rel:parent:${PARENT}`)
    await pressKey($, w, BACK_KEY)
    const tree = await $.ui.render(PANE)
    expect(readPaths(w)).toEqual([A, PARENT, A])
    expect(textOf(tree, 'list ›')).toBeDefined()
    expect(nodesOf(tree, 'Markdown').map((node: any) => node.props.text)).toEqual(['body\n'])
  })

  test('a read still pending for the card left never lands', async ($, on) => {
    const w = world(on, { read: 'defer' })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, BACK_KEY)
    w.release(2, CARD)
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree).length).toBeGreaterThan(0)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
  })

  test('a deeper back shows the reading line until the re-read lands', async ($, on) => {
    const w = world(on, { query: ROWS, read: 'defer' })
    await issue($, '')
    await $.ui.render(PANE)
    const first = $.ui.press({ plugin: 'obw', key: rowKey(A) })
    await w.clock.settle()
    w.release(2, RELATED_CARD)
    await first
    await w.clock.settle()
    await $.ui.render(PANE)
    const second = $.ui.press({ plugin: 'obw', key: `rel:parent:${PARENT}` })
    await w.clock.settle()
    w.release(3, CARD)
    await second
    await w.clock.settle()
    await $.ui.render(PANE)
    const third = $.ui.press({ plugin: 'obw', key: BACK_KEY })
    await w.clock.settle()
    const waiting = await $.ui.render(PANE)
    expect(textOf(waiting, 'list ›')).toBeDefined()
    expect(stringsIn(waiting)).toContain('Reading a…')
    w.release(4, RELATED_CARD)
    await third
    await w.clock.settle()
    expect(nodesOf(await $.ui.render(PANE), 'Markdown').map((node: any) => node.props.text)).toEqual(['body\n'])
  })
})

describe('/issue <card> in All Tasks', () => {
  const MOD = 'mod-obw-issue-pane'
  const ARG_ROWS = JSON.stringify([MOD, 'other'].map((name) => ({ path: P(name), status: 'todo' })))

  test('draws the card view and back leads to the list', async ($, on) => {
    const w = world(on, { query: ARG_ROWS })
    await issue($, MOD)
    expect(w.runs.map((run: any) => run.argv)).toEqual([DASHBOARD_ARGV, ALL_TASKS_ARGV, readArgv(P(MOD))])
    const tree = await $.ui.render(PANE)
    expect(buttonOf(tree, BACK_KEY)).toBeDefined()
    expect(textOf(tree, 'list ›')).toBeDefined()
    expect(headingKeys(tree)).toEqual([])
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium · AC 0/1')
    await pressKey($, w, BACK_KEY)
    const list = await $.ui.render(PANE)
    expect(headingKeys(list).length).toBeGreaterThan(0)
    expect(nodesOf(list, 'Markdown')).toHaveLength(0)
  })

  test('another view keeps its flat list above the card with no back', async ($, on) => {
    world(on, { query: ARG_ROWS })
    await issue($, 'Active')
    await issue($, 'other')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select').some((node: any) => node.props.key === 'cards')).toBe(true)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(1)
    expect(buttonOf(tree, BACK_KEY)).toBeUndefined()
  })

  test('a dashboard with no listed views draws the card alone', async ($, on) => {
    world(on, { views: { deny: 'no' }, reads: { 'pm/cc-plugins/tasks/zzz.md': CARD } })
    await issue($, 'zzz')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(1)
    expect(buttonOf(tree, BACK_KEY)).toBeUndefined()
  })

  test('a missing card draws its error in the card view', async ($, on) => {
    const message = 'Error: File "pm/cc-plugins/tasks/nope.md" not found.\n'
    world(on, { read: message })
    await issue($, 'nope')
    const tree = await $.ui.render(PANE)
    expect(textOf(tree, message.trim()).props.color).toBe('error')
    expect(buttonOf(tree, BACK_KEY)).toBeDefined()
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
  })

  test('a second /issue closes the open card and keeps the list', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree).length).toBeGreaterThan(0)
    expect(buttonOf(tree, BACK_KEY)).toBeUndefined()
  })
})

describe('a stale read', () => {
  test('a card read released after back never brings the card back', async ($, on) => {
    const w = world(on, { read: 'defer' })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, BACK_KEY)
    w.release(2, CARD)
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree).length).toBeGreaterThan(0)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
  })
})

describe('the list rows stay Buttons until a card opens', () => {
  test('rows are drawn before a press and gone after', async ($, on) => {
    const w = world(on)
    await issue($, '')
    expect(rowKeys(await $.ui.render(PANE))).toEqual([rowKey(A)])
    await pressKey($, w, rowKey(A))
    expect(rowKeys(await $.ui.render(PANE))).toEqual([])
  })
})

describe('a focus the engine refuses', () => {
  test('leaves the card drawn', async ($, on) => {
    const w = world(on)
    await issue($, '')
    await pressKey($, w, rowKey(A))
    expect(buttonOf(await $.ui.render(PANE), BACK_KEY)).toBeDefined()
    await pressKey($, w, BACK_KEY)
    expect(headingKeys(await $.ui.render(PANE)).length).toBeGreaterThan(0)
  })
})

describe('two back presses in a row', () => {
  test('from the second card leave the list with no card drawn', async ($, on) => {
    const w = world(on, { query: ROWS, reads: { [A]: RELATED_CARD, [PARENT]: CARD } })
    await issue($, '')
    await pressKey($, w, rowKey(A))
    await pressKey($, w, `rel:parent:${PARENT}`)
    await $.ui.render(PANE)
    await Promise.all([$.ui.press({ plugin: 'obw', key: BACK_KEY }), $.ui.press({ plugin: 'obw', key: BACK_KEY })])
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree).length).toBeGreaterThan(0)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
    expect(buttonOf(tree, BACK_KEY)).toBeUndefined()
  })
})

describe('relations in another view', () => {
  const opened = async ($: any, on: any) => {
    const w = world(on, { query: 'defer', reads: { [A]: RELATED_CARD } })
    await $.session.start(SESSION)
    const allTasks = $.command.run({ command: 'issue', args: 'All Tasks' })
    await w.clock.settle()
    w.release(w.runs.length - 1, ROWS)
    await allTasks
    const active = $.command.run({ command: 'issue', args: 'Active' })
    await w.clock.settle()
    w.release(w.runs.length - 1, JSON.stringify([{ path: A, status: 'todo', title: 'A' }]))
    await active
    await w.clock.settle()
    await pick($, w, 'cards', A)
    return $.ui.render(PANE)
  }

  test('a card shown in Active draws no relation lines', async ($, on) => {
    const tree = await opened($, on)
    expect(stringsIn(tree).some((text) => text.includes('not in all tasks'))).toBe(false)
    expect(buttonsIn(tree).filter((node: any) => node.props.key.startsWith('rel:'))).toEqual([])
  })

  test('keeps the views picker and draws no back Button', async ($, on) => {
    const tree = await opened($, on)
    expect(buttonOf(tree, BACK_KEY)).toBeUndefined()
    expect(nodesOf(tree, 'Select').map((node: any) => node.props.key)).toContain('views')
  })
})
