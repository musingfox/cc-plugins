import { describe, expect, mock, test } from 'claude-code/testing'

// Each test mounts AssistantMessage through the engine with a hook beneath the
// plugin that records the text it was handed: what the engine would draw.

const SOURCES = {
  flowchart: 'flowchart TD\n  A[Prompt] --> B{Tool?}\n  B -- yes --> C[Call tool]\n  B -- no --> D[Reply]',
  state: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working: prompt\n  Working --> Idle: reply',
  sequence: 'sequenceDiagram\n  participant U as User\n  participant C as Claude\n  U->>C: prompt\n  C-->>U: reply',
  class: 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  Animal <|-- Dog',
  xychart: 'xychart-beta\n  title "Runs"\n  x-axis [mon, tue, wed]\n  y-axis "count" 0 --> 10\n  bar [3, 7, 5]',
  gantt: 'gantt\n  title Release\n  section Build\n  compile :a1, 2024-01-01, 1d',
  pie: 'pie title Pets\n  "Dogs" : 3\n  "Cats" : 2',
  mindmap: 'mindmap\n  root((viz))\n    inline\n    render',
  er: 'erDiagram\n  USER ||--o{ SESSION : has\n  SESSION ||--|{ MESSAGE : contains',
  cjk: 'flowchart LR\n  A[使用者] --> B[回覆]',
}

const SURFACES = ['terminal', 'desktop'] as const
const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

// what the engine answers beneath the plugin at session start: an empty store, a registered command
function engine(on: any) {
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  mock.store(on, {})
  on('command.register', ($: any, e: any) => ({ value: { command: e.name } }))
}

const fenced = (source: string) => 'Here:\n\n```mermaid\n' + source + '\n```\n\nDone.'

async function drawnText($: any, on: any, surface: (typeof SURFACES)[number], text: string): Promise<string> {
  engine(on)
  const seen: string[] = []
  on('ui.render', { component: 'AssistantMessage' }, async ($: any, e: any) => {
    seen.push(e.props.text)
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'drawn')
  })
  await $.session.start(SESSION)
  const ui = await $.ui.mount({
    plugin: 'mermaid-inline',
    surface,
    component: 'AssistantMessage',
    props: { text, isFirstOfReply: true },
    viewport: { columns: 100, rows: 40 },
  })
  await ui.unmount()
  return seen[seen.length - 1] ?? ''
}

// East Asian Wide and Fullwidth take two terminal columns
const columnsOf = (line: string) =>
  [...line].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿가-힣＀-｠]/u.test(ch) ? 2 : 1), 0)

const artOf = (text: string) => {
  const match = /```text\n([\s\S]*?)\n```/.exec(text)
  if (!match) throw new Error(`no text fence in: ${text}`)
  return match[1]!.split('\n')
}

for (const surface of SURFACES) {
  describe(`with default settings on ${surface}`, () => {
    for (const kind of ['flowchart', 'state', 'sequence', 'class', 'xychart'] as const) {
      test(`${kind} is drawn as plain box art in place of its fence`, async ($, on) => {
        const got = await drawnText($, on, surface, fenced(SOURCES[kind]))
        expect(got).not.toContain('```mermaid')
        expect(got).toContain('```text\n')
        expect(got).not.toContain('\x1b')
        expect(got.startsWith('Here:\n\n')).toBe(true)
        expect(got.endsWith('\n\nDone.')).toBe(true)
      })
    }

    for (const kind of ['gantt', 'pie', 'mindmap', 'er'] as const) {
      test(`${kind} keeps its fence as written`, async ($, on) => {
        const text = fenced(SOURCES[kind])
        expect(await drawnText($, on, surface, text)).toBe(text)
      })
    }

    test('box borders line up with labels of wide characters', async ($, on) => {
      const art = artOf(await drawnText($, on, surface, fenced(SOURCES.cjk)))
      const label = art.find(line => line.includes('使用者'))!
      expect(label).toContain('回覆')
      const top = art.find(line => line.includes('┌'))!
      expect(columnsOf(label)).toBe(columnsOf(top))
      const at = (line: string, char: string) => columnsOf(line.slice(0, line.indexOf(char)))
      expect(at(label, '├')).toBe(at(top, '┐'))
    })
  })
}

test('/mermaid-inline answers its settings, with no colour setting', async ($, on) => {
  engine(on)
  await $.session.start(SESSION)
  const answer: any = await $.command.run({ command: 'mermaid-inline', args: '' } as any)
  expect(answer.text).toContain('ascii off')
  expect(answer.text).toContain('lr on')
  expect(answer.text).not.toContain('color')
})
