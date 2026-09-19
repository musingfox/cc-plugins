import { describe, expect, test } from 'claude-code/testing'
import { PANE, issue, nodesOf, press, stringsIn, vizWorld } from './fixtures/pane.ts'
import { CARD, DIAGRAM, MERMAID_CARD, SESSION, world } from './fixtures/world.ts'

const MERMAID_BODY = '# m\n\n```mermaid\ngraph LR\nA-->B\n```\n\ntail\n'
const TWO_BLOCKS = '```mermaid\ngraph LR\nA-->B\n```\n\n```mermaid\npie\n```\n'

const cardOf = (body: string) => `---\ntitle: m\n---\n${body}`
const uvxRuns = (w: any) => w.runs.filter((run: any) => run.argv[0] === 'uvx')

const DRAWN = ' ┌─┐\n │A│\n └─┘'
const DRAWABLE = /^[^\x00-\x08\x0b-\x1f\x7f-\x9f]*$/
const AB = '["pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/b.md"]'

// Every element in drawing order.
function elementsIn(node: any): any[] {
  if (!node || typeof node !== 'object') return []
  return [node, ...[...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(elementsIn)]
}

const bodyOf = (tree: any) =>
  elementsIn(tree)
    .filter((node) => node.type === 'Markdown' || node.type === 'Code')
    .map((node) => [node.type, node.props.text ?? node.props.source])

async function shown($: any, w: any, card = 'm') {
  await issue($, card)
  await w.clock.settle()
}

describe('running termaid', () => {
  test('a mermaid block is piped to one pinned termaid run', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD })
    await shown($, w)
    expect(w.runs.length).toBe(3)
    expect(w.runs[2].argv).toEqual(['uvx', 'termaid@0.9.0', '--width', '80'])
    expect(w.runs[2].init).toEqual({ stdin: 'graph LR\nA-->B', timeoutMs: 5000 })
  })

  test('the obsidian read carries no stdin', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD })
    await shown($, w)
    expect('stdin' in w.runs[1].init).toBe(false)
    expect(w.runs[1].init).toEqual({ timeoutMs: 10000 })
  })

  test('a header termaid does not draw starts no run', async ($, on) => {
    const w = world(on, { read: cardOf('```mermaid\nsankey-beta\nA,B,10\n```\n') })
    await shown($, w)
    expect(w.runs.length).toBe(2)
    expect(uvxRuns(w).length).toBe(0)
  })

  test('a block led by a %% comment starts no run', async ($, on) => {
    const w = world(on, { read: cardOf('```mermaid\n%% c\nsequenceDiagram\nA->>B: hi\n```\n') })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(0)
  })

  test('two blocks run in document order', async ($, on) => {
    const w = world(on, { read: cardOf(TWO_BLOCKS) })
    await shown($, w)
    expect(w.runs[2].init.stdin.startsWith('graph LR')).toBe(true)
    expect(w.runs[3].init.stdin.startsWith('pie')).toBe(true)
  })

  test('a fence that is not mermaid starts no run', async ($, on) => {
    const w = world(on, { read: cardOf('```js\nlet a = 1\n```\n') })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(0)
  })

  test('a block cut by the clip starts no run', async ($, on) => {
    const w = world(on, { read: cardOf('x'.repeat(9990) + '\n```mermaid\ngraph LR\n```\n') })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(0)
  })

  test('a card without a fence runs only the search and the read', async ($, on) => {
    const w = world(on, { read: CARD })
    await shown($, w, 'mod-obw-issue-pane')
    expect(w.runs.length).toBe(2)
  })
})

describe('termaid runs stop early', () => {
  test('the next block runs only after the previous one settles', async ($, on) => {
    const w = world(on, { read: cardOf(TWO_BLOCKS), termaid: 'defer' })
    await shown($, w)
    expect(w.runs.length).toBe(3)
    w.release(2, 'A')
    await w.clock.settle()
    expect(w.runs.length).toBe(4)
    w.release(3, 'B')
    await w.clock.settle()
  })

  test('a run that cannot start stops the rest', async ($, on) => {
    const w = world(on, { read: cardOf(TWO_BLOCKS), termaid: { deny: 'spawn failed' } })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(1)
  })

  test('a failed run fails only its own block', async ($, on) => {
    const w = world(on, { read: cardOf(TWO_BLOCKS), termaid: { exitCode: 1, stderr: 'Error rendering diagram: x' } })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(2)
  })

  test('a newer /issue stops the runs of the older read', async ($, on) => {
    const w = world(on, { read: cardOf(TWO_BLOCKS), termaid: 'defer' })
    await shown($, w, 'a')
    await shown($, w, 'b')
    expect(w.runs.length).toBe(6)
    w.release(2, 'A')
    await w.clock.settle()
    expect(w.runs.length).toBe(6)
    w.release(5, 'B')
    await w.clock.settle()
  })
})

describe('the card draws before its diagrams', () => {
  test('/issue resolves while termaid is still running', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: 'hang' })
    await $.session.start(SESSION)
    let finished = false
    const done = $.command.run({ command: 'issue', args: 'm' }).then((result: any) => {
      finished = true
      return result
    })
    await w.clock.settle()
    expect(finished).toBe(true)
    expect(await done).toEqual({})
    await w.clock.advance(60000)
  })

  test('a pending block is drawn as its code block in the one Markdown', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: 'm' })
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    const markdowns = nodesOf(tree, 'Markdown')
    expect(markdowns.length).toBe(1)
    expect(markdowns[0].props.text).toBe(MERMAID_BODY)
    expect(nodesOf(tree, 'Code').length).toBe(0)
    await w.clock.advance(60000)
    await done
  })
})

describe('a drawn diagram swaps in', () => {
  test('the diagram replaces its block between the markdown around it', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    expect(bodyOf(tree)).toEqual([
      ['Markdown', '# m\n\n'],
      ['Code', DRAWN],
      ['Markdown', '\ntail\n'],
    ])
    expect(nodesOf(tree, 'Code')[0].props).toEqual({ source: DRAWN, wrap: 'truncate-end' })
  })

  test('a body that is only a block draws no Markdown', async ($, on) => {
    const w = world(on, { read: cardOf('```mermaid\ngraph LR\n```\n') })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Code').length).toBe(1)
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })

  test('a block without a diagram stays in the markdown after a drawn one', async ($, on) => {
    const w = world(on, { read: cardOf('# m\n\n```mermaid\ngraph LR\n```\n\n```mermaid\npie\n```\n'), termaid: 'defer' })
    await shown($, w)
    w.release(2, DIAGRAM)
    await w.clock.settle()
    w.release(3, '\n')
    await w.clock.settle()
    expect(bodyOf(await $.ui.render(PANE))).toEqual([
      ['Markdown', '# m\n\n'],
      ['Code', DRAWN],
      ['Markdown', '\n```mermaid\npie\n```\n'],
    ])
  })

  test('a diagram in a clipped body keeps the body clip notice', async ($, on) => {
    const w = world(on, { read: cardOf('```mermaid\ngraph LR\n```\n' + 'x'.repeat(11000)) })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    expect(uvxRuns(w).length).toBe(1)
    const body = bodyOf(tree)
    expect(body[0][0]).toBe('Code')
    expect(body[1][1].length).toBe(10000 - 24)
    expect(stringsIn(tree)).toContain('Clipped: showing 10000 of 11024 characters.')
  })

  test('a diagram lands on its own block when a block before it is not drawable', async ($, on) => {
    const w = world(on, { read: cardOf('```mermaid\nsankey-beta\n```\n\n```mermaid\ngraph LR\n```\n') })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(1)
    expect(bodyOf(await $.ui.render(PANE))).toEqual([
      ['Markdown', '```mermaid\nsankey-beta\n```\n\n'],
      ['Code', DRAWN],
    ])
  })

  test('a block whose closing fence the clip cuts stays markdown after a drawn one', async ($, on) => {
    const cut = 'x'.repeat(9960) + '\n```mermaid\npie\n'
    const w = world(on, { read: cardOf('```mermaid\ngraph LR\n```\n' + cut + '```\n') })
    await shown($, w)
    expect(uvxRuns(w).length).toBe(1)
    expect(bodyOf(await $.ui.render(PANE))).toEqual([
      ['Code', DRAWN],
      ['Markdown', cut],
    ])
  })

  test('the diagram is among the strings drawn', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD })
    await shown($, w)
    expect(stringsIn(await $.ui.render(PANE))).toContain(DRAWN)
  })

  test('the button stays before the diagram and a press writes the raw body', async ($, on) => {
    const w = vizWorld(on, { read: MERMAID_CARD })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Button').length).toBe(1)
    const order = elementsIn(tree).map((node) => node.type)
    expect(order.indexOf('Button')).toBeLessThan(order.indexOf('Code'))
    await press($, w)
    expect(w.writes[0].text).toBe(MERMAID_BODY)
    expect(nodesOf(await $.ui.render(PANE), 'Code').length).toBe(1)
  })

  test('a diagram landing after a press keeps the browser outcome', async ($, on) => {
    const w = vizWorld(on, { read: MERMAID_CARD, termaid: 'defer' })
    await shown($, w)
    await press($, w)
    w.release(2, DIAGRAM)
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain('Opened in the browser: /tmp/viz/work/obw-mod-obw-issue-pane-260919120000.html')
    expect(nodesOf(tree, 'Code').length).toBe(1)
  })
})

describe('a diagram that could not be drawn', () => {
  const asToday = (tree: any) => {
    expect(nodesOf(tree, 'Code').length).toBe(0)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
    expect(nodesOf(tree, 'Markdown')[0].props.text).toBe(MERMAID_BODY)
  }

  test('blank output leaves the code block', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: '\n' })
    await shown($, w)
    asToday(await $.ui.render(PANE))
  })

  test('a failed run leaves the code block', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: { exitCode: 1, stderr: 'Error: Empty input.\n' } })
    await shown($, w)
    asToday(await $.ui.render(PANE))
  })

  test('a run that cannot start leaves the code block and says nothing', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: { deny: 'ENOENT' } })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    asToday(tree)
    expect(stringsIn(tree).some((text) => /termaid|uvx/.test(text))).toBe(false)
    expect(tree.type).not.toBe('engine')
  })
})

describe('a diagram after a newer read', () => {
  test('a diagram for another card is dropped', async ($, on) => {
    const w = world(on, { search: AB, read: MERMAID_CARD, termaid: 'defer' })
    await shown($, w, 'a')
    await shown($, w, 'b')
    w.release(2, 'DIAGRAM-A')
    await w.clock.settle()
    let tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Code').length).toBe(0)
    expect(stringsIn(tree)).not.toContain('DIAGRAM-A')
    expect(nodesOf(tree, 'Select')[0].props.value).toBe('b')
    w.release(5, 'DIAGRAM-B')
    await w.clock.settle()
    tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Code').map((node: any) => node.props.source)).toEqual(['DIAGRAM-B'])
  })

  test('a diagram for an older read of the same card is dropped', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: 'defer' })
    await shown($, w, 'a')
    await shown($, w, 'a')
    w.release(2, 'OLD')
    await w.clock.settle()
    expect(nodesOf(await $.ui.render(PANE), 'Code').length).toBe(0)
    w.release(5, 'NEW')
    await w.clock.settle()
    expect(nodesOf(await $.ui.render(PANE), 'Code').map((node: any) => node.props.source)).toEqual(['NEW'])
  })

  test('a press does not drop a pending diagram', async ($, on) => {
    const w = vizWorld(on, { read: MERMAID_CARD, termaid: 'defer' })
    await shown($, w)
    await press($, w)
    w.release(2, DIAGRAM)
    await w.clock.settle()
    expect(nodesOf(await $.ui.render(PANE), 'Code').length).toBe(1)
  })
})

describe('bounded diagram text', () => {
  test('control characters are stripped from the diagram', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: 'A\r\x1b[31mB\n' })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Code')[0].props.source).toBe('A[31mB')
    for (const text of stringsIn(tree)) expect(text).toMatch(DRAWABLE)
  })

  test('a diagram over 10000 characters is clipped with a notice before it', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD, termaid: 'y'.repeat(11000) })
    await shown($, w)
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    const elements = elementsIn(tree)
    const code = elements.findIndex((node) => node.type === 'Code')
    expect(elements[code].props.source.length).toBe(10000)
    expect(elements[code - 1].type).toBe('Text')
    expect(elements[code - 1].props.dimColor).toBe(true)
    expect(stringsIn(elements[code - 1])).toEqual(['Clipped: showing 10000 of 11000 characters.'])
  })
})
