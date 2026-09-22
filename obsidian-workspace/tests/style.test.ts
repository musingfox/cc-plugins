import { describe, expect, test } from 'claude-code/testing'
import { priorityColor, statusColor } from '../hooks/style.ts'
import { PANE, cardSelect, headerIn, issue, mounted, nodesOf, press, runsOf, shown, stringsIn, viewSelect, vizWorld } from './fixtures/pane.ts'
import { AB, SESSION, VIEW_NAMES, VIEW_STRINGS, world } from './fixtures/world.ts'

describe('statusColor', () => {
  const cases: [string | undefined, string | undefined][] = [
    ['todo', '#8b8d98'],
    ['in-progress', '#0090ff'],
    ['blocked', '#e5484d'],
    ['done', '#46a758'],
    ['Done', undefined],
    ['wip', undefined],
    [undefined, undefined],
  ]
  for (const [status, color] of cases) test(`colours ${status} as ${color}`, () => expect(statusColor(status)).toBe(color))
})

describe('priorityColor', () => {
  const cases: [string | undefined, string | undefined][] = [
    ['high', '#e5484d'],
    ['medium', '#f5a524'],
    ['low', '#8b8d98'],
    ['urgent', undefined],
    [undefined, undefined],
  ]
  for (const [priority, color] of cases) test(`colours ${priority} as ${color}`, () => expect(priorityColor(priority)).toBe(color))
})

const ORANGE = '#f5a524'
const RED = '#e5484d'
const GREY = '#8b8d98'
const MOD = 'mod-obw-issue-pane'
const MOD_PATH = `pm/cc-plugins/tasks/${MOD}.md`

// The Text drawn with exactly `text` as its only child.
const textIn = (tree: any, text: string) =>
  nodesOf(tree, 'Text').find((node: any) => JSON.stringify(node.children) === JSON.stringify([text]))

// An element drawn with no props carries no `props` key at all.
const propsOf = (node: any) => node.props ?? {}

async function drawn($: any, w: any, card: string) {
  await shown($, w, card)
  return $.ui.render(PANE)
}

describe('the status label', () => {
  test('a todo card reads its whole header with a grey status', async ($, on) => {
    const w = world(on)
    const tree = await drawn($, w, MOD)
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium · AC 0/1')
    expect(textIn(headerIn(tree), 'todo').props.color).toBe(GREY)
  })

  test('a status outside the vocabulary has no colour', async ($, on) => {
    const w = world(on, { read: '---\nstatus: wip\n---\nbody\n' })
    const tree = await drawn($, w, 'k')
    expect('color' in propsOf(textIn(headerIn(tree), 'wip'))).toBe(false)
  })

  test('an absent status is a dash with no colour', async ($, on) => {
    const w = world(on, { read: '---\npriority: high\n---\nbody\n' })
    const header = headerIn(await drawn($, w, 'k'))
    expect(stringsIn(header).join('')).toBe('status: — · priority: high')
    expect('color' in propsOf(textIn(header, '—'))).toBe(false)
    expect(textIn(header, 'high').props.color).toBe(RED)
  })

  test('a doc row without a status reads a dash in its card header', async ($, on) => {
    const w = world(on, { query: '[{"path":"pm/cc-plugins/docs/d.md"}]', read: '---\ntitle: d\n---\nbody\n' })
    const tree = await drawn($, w, 'Active')
    expect(cardSelect(tree).props.options).toEqual([{ value: 'pm/cc-plugins/docs/d.md', label: 'd' }])
    const pane = await mounted($)
    await pane.select({ key: 'cards', value: 'pm/cc-plugins/docs/d.md' })
    await w.clock.settle()
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/docs/d.md')
    expect(stringsIn(headerIn(await $.ui.render(PANE))).join('')).toBe('status: — · priority: —')
  })
})

describe('the priority label', () => {
  test('a medium priority is orange', async ($, on) => {
    const w = world(on)
    expect(textIn(headerIn(await drawn($, w, MOD)), 'medium').props.color).toBe(ORANGE)
  })

  test('an absent priority is a dash with no colour', async ($, on) => {
    const w = world(on, { read: '---\nstatus: todo\n---\nbody\n' })
    const header = headerIn(await drawn($, w, 'k'))
    expect(stringsIn(header).join('')).toBe('status: todo · priority: —')
    expect('color' in propsOf(textIn(header, '—'))).toBe(false)
  })

  test('a priority holding a carriage return is drawn without it', async ($, on) => {
    const w = world(on, { read: '---\nstatus: todo\npriority: "a\rb"\n---\nx\n' })
    const header = headerIn(await drawn($, w, 'k'))
    expect(textIn(header, 'ab')).toBeDefined()
    expect(stringsIn(header).join('')).toBe('status: todo · priority: ab')
  })
})

describe('the acceptance criteria label', () => {
  test('boxes past the clip are still counted', async ($, on) => {
    const w = world(on, { read: '---\ntitle: t\n---\n' + 'x'.repeat(11000) + '\n## Acceptance Criteria\n- [x] a\n' })
    const header = headerIn(await drawn($, w, 'k'))
    expect(stringsIn(header).join('').endsWith(' · AC 1/1')).toBe(true)
  })

  test('the label is plain and only the title is bold', async ($, on) => {
    const w = world(on)
    const tree = await drawn($, w, MOD)
    expect(nodesOf(tree, 'Text').filter((node: any) => node.props?.bold).length).toBe(1)
    const label = propsOf(textIn(headerIn(tree), 'AC 0/1'))
    expect('bold' in label).toBe(false)
    expect('color' in label).toBe(false)
    expect('dimColor' in label).toBe(false)
  })
})

describe('the card separator', () => {
  const separatorIn = (tree: any) => nodesOf(tree, 'Box').find((node: any) => node.props.marginTop === 1)

  test('a rule as wide as the pane body sits above the card after a blank row', async ($, on) => {
    const w = world(on)
    const tree = await drawn($, w, MOD)
    const rule = separatorIn(tree).children[0]
    expect(stringsIn(rule)).toEqual(['─'.repeat(80)])
    expect(rule.props.dimColor).toBe(true)
    const flat = JSON.stringify(tree)
    expect(flat.indexOf('"type":"Select"')).toBeGreaterThan(-1)
    expect(flat.indexOf('"type":"Select"')).toBeLessThan(flat.indexOf('"marginTop":1'))
  })

  test('a pane without a body width draws a 40-column rule', async ($, on) => {
    const w = world(on)
    await issue($, MOD)
    await w.clock.settle()
    const tree = await $.ui.render({ ...PANE, props: { ...PANE.props, bodyColumns: undefined } })
    expect(stringsIn(separatorIn(tree).children[0])).toEqual(['─'.repeat(40)])
  })

  test('a list without a card draws no separator', async ($, on) => {
    const w = world(on, { query: AB })
    const tree = await drawn($, w, 'Active')
    expect(separatorIn(tree)).toBe(undefined)
    expect(stringsIn(tree)).toEqual([
      ...VIEW_STRINGS,
      'pm/cc-plugins/tasks/a.md',
      'todo · a',
      'pm/cc-plugins/tasks/b.md',
      'todo · b',
    ])
  })

  test('a card being read has the separator above it', async ($, on) => {
    const w = world(on, { query: `[{"path":"${MOD_PATH}","status":"todo"}]`, read: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: MOD })
    await w.clock.settle()
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings).toContain('─'.repeat(80))
    expect(strings).toContain(`Reading ${MOD}…`)
    await w.clock.advance(60000)
    await done
  })

  test('a card error has the separator above it', async ($, on) => {
    const w = world(on, { read: 'Vault not found.' })
    const strings = stringsIn(await drawn($, w, 'k'))
    expect(strings.indexOf('─'.repeat(80))).toBeGreaterThan(-1)
    expect(strings.indexOf('─'.repeat(80))).toBeLessThan(strings.indexOf('Vault not found.'))
  })
})

describe('error messages', () => {
  const isRed = (node: any) => {
    expect(node.props.color).toBe(RED)
    expect('dimColor' in node.props).toBe(false)
  }
  const isDim = (node: any) => {
    expect(node.props.dimColor).toBe(true)
    expect('color' in node.props).toBe(false)
  }

  test('a query error is red', async ($, on) => {
    const w = world(on, { query: 'Vault not found.\n' })
    isRed(textIn(await drawn($, w, ''), 'Vault not found.'))
  })

  test('the pm hint under a query error stays dim', async ($, on) => {
    const w = world(on, { query: 'Vault not found.\n' })
    isDim(textIn(await drawn($, w, ''), 'If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.'))
  })

  test('a missing config is red', async ($, on) => {
    const w = world(on, { files: {} })
    isRed(textIn(await drawn($, w, ''), 'No .obsidian.yaml in /work or any directory above it.'))
  })

  test('a card read error is red', async ($, on) => {
    const w = world(on, { read: 'Error: File "pm/cc-plugins/tasks/nope.md" not found.\n' })
    isRed(textIn(await drawn($, w, 'nope'), 'Error: File "pm/cc-plugins/tasks/nope.md" not found.'))
  })

  test('a browser error is red', async ($, on) => {
    const w = vizWorld(on, { render: { exitCode: 1, stderr: 'Error: File not found: x\n' } })
    await drawn($, w, MOD)
    await press($, w)
    isRed(textIn(await $.ui.render(PANE), 'Error: File not found: x'))
  })

  test('the empty-list notice stays dim', async ($, on) => {
    const w = world(on, { query: '[]' })
    const tree = await drawn($, w, '')
    isDim(textIn(tree, 'No cards in the All Tasks view of pm/cc-plugins.'))
    expect(nodesOf(tree, 'Text').some((node: any) => node.props?.color === RED)).toBe(false)
  })

  test('the vault progress line stays dim', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    isDim(textIn(await $.ui.render(PANE), 'Reading the vault…'))
    await w.clock.advance(60000)
    await done
  })

  test('the browser progress line stays dim', async ($, on) => {
    const w = vizWorld(on, { render: 'defer' })
    await drawn($, w, MOD)
    await press($, w)
    isDim(textIn(await $.ui.render(PANE), 'Rendering in the browser…'))
  })
})

describe('the view picker', () => {
  test('the view picker is drawn above the list with the chosen view selected', async ($, on) => {
    const w = world(on)
    const tree = await drawn($, w, '')
    expect(viewSelect(tree).props.value).toBe('All Tasks')
    expect(viewSelect(tree).props.options).toEqual(VIEW_NAMES.map((name) => ({ value: name, label: name })))
    const flat = JSON.stringify(tree)
    expect(flat.indexOf('"key":"views"')).toBeLessThan(flat.indexOf('"key":"board"'))
  })
})
