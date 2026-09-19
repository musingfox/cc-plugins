import { describe, expect, test } from 'claude-code/testing'
import { PANE, issue, nodesOf } from './fixtures/pane.ts'
import { CARD, MERMAID_CARD, SESSION, world } from './fixtures/world.ts'

const MERMAID_BODY = '# m\n\n```mermaid\ngraph LR\nA-->B\n```\n\ntail\n'
const TWO_BLOCKS = '```mermaid\ngraph LR\nA-->B\n```\n\n```mermaid\npie\n```\n'

const cardOf = (body: string) => `---\ntitle: m\n---\n${body}`
const uvxRuns = (w: any) => w.runs.filter((run: any) => run.argv[0] === 'uvx')

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
