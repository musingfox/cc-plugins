import { describe, expect, test } from 'claude-code/testing'
import { diagramOutcome, splitFences, termaidHeaderAllowed } from '../hooks/mermaid.ts'

const md = (text: string) => ({ kind: 'markdown', text })

describe('splitFences', () => {
  const cases: [string, string, unknown][] = [
    [
      'cuts a mermaid block out of the markdown around it',
      'a\n```mermaid\ngraph LR\nA-->B\n```\nb\n',
      [md('a\n'), { kind: 'mermaid', text: '```mermaid\ngraph LR\nA-->B\n```\n', source: 'graph LR\nA-->B' }, md('b\n')],
    ],
    [
      'reads a tilde fence with more words in its info string',
      '~~~ mermaid title\npie\n~~~\n',
      [{ kind: 'mermaid', text: '~~~ mermaid title\npie\n~~~\n', source: 'pie' }],
    ],
    [
      'removes the opener indent from each content line',
      '  ```mermaid\n  graph LR\n    A-->B\n  ```\n',
      [{ kind: 'mermaid', text: '  ```mermaid\n  graph LR\n    A-->B\n  ```\n', source: 'graph LR\n  A-->B' }],
    ],
    ['leaves a fence indented four spaces as markdown', '    ```mermaid\ngraph\n```\n', [md('    ```mermaid\ngraph\n```\n')]],
    ['leaves an unclosed fence as markdown', '```mermaid\ngraph LR\n', [md('```mermaid\ngraph LR\n')]],
    [
      'leaves a mermaid fence inside another fence as content',
      '````text\n```mermaid\ngraph LR\n```\n````\n',
      [md('````text\n```mermaid\ngraph LR\n```\n````\n')],
    ],
    ['refuses a backtick opener with a backtick in its info string', '```mermaid ```\nx\n```\n', [md('```mermaid ```\nx\n```\n')]],
    ['leaves inline code as markdown', 'see `` ```mermaid `` inline\n', [md('see `` ```mermaid `` inline\n')]],
    ['matches mermaid case-sensitively', '```Mermaid\ngraph\n```\n', [md('```Mermaid\ngraph\n```\n')]],
    ['matches the whole first word', '```mermaidx\ngraph\n```\n', [md('```mermaidx\ngraph\n```\n')]],
    [
      'keeps a shorter closer as content',
      '````mermaid\ngraph\n```\n````\n',
      [{ kind: 'mermaid', text: '````mermaid\ngraph\n```\n````\n', source: 'graph\n```' }],
    ],
    [
      'does not close tildes with backticks',
      '~~~mermaid\ngraph\n```\n~~~\n',
      [{ kind: 'mermaid', text: '~~~mermaid\ngraph\n```\n~~~\n', source: 'graph\n```' }],
    ],
    ['reads an empty block', '```mermaid\n```\n', [{ kind: 'mermaid', text: '```mermaid\n```\n', source: '' }]],
    ['gives nothing for empty text', '', []],
  ]
  for (const [name, text, segments] of cases) {
    test(name, () => {
      expect(splitFences(text)).toEqual(segments)
      expect(
        splitFences(text)
          .map((segment) => segment.text)
          .join(''),
      ).toBe(text)
    })
  }
})

describe('termaidHeaderAllowed', () => {
  const allowed = [
    'graph LR\nA-->B',
    'graph',
    '\n\n  sequenceDiagram\nA->>B: hi',
    'stateDiagram-v2',
    'block-beta',
    'architecture-beta',
    'treemap-beta',
    'packet-beta',
    'xychart-beta',
    'quadrantChart',
    'gitGraph',
    'kanban',
    'pie title Pets',
  ]
  for (const source of allowed) test(`allows ${JSON.stringify(source)}`, () => expect(termaidHeaderAllowed(source)).toBe(true))

  const refused = [
    'sankey-beta\nA,B,10',
    'requirementDiagram',
    'C4Context',
    'pieX',
    'blockquote',
    'Graph LR',
    '%% note\nsequenceDiagram\nA->>B: hi',
    '%%{init: {}}%%\ngraph LR',
    '---\ntitle: x\n---\ngraph LR',
    '',
    '  \n\n',
    'classDiagram-v2',
    'flowchart-elk',
  ]
  for (const source of refused) test(`refuses ${JSON.stringify(source)}`, () => expect(termaidHeaderAllowed(source)).toBe(false))
})

describe('diagramOutcome', () => {
  const exited = (exitCode: number, stdout: string, stderr = '') => ({ kind: 'exited' as const, exitCode, stdout, stderr })

  test('drops trailing whitespace and keeps leading spaces', () => {
    expect(diagramOutcome(exited(0, ' ┌─┐\n │A│\n └─┘\n'))).toBe(' ┌─┐\n │A│\n └─┘')
  })

  test('takes a lone newline as no diagram', () => expect(diagramOutcome(exited(0, '\n'))).toBe(null))

  test('takes blank output as no diagram', () => expect(diagramOutcome(exited(0, '   \n\n'))).toBe(null))

  test('ignores a warning on stderr', () => {
    expect(diagramOutcome(exited(0, 'A\n', 'Warning: diagram is 98 cols wide but target is 80\n'))).toBe('A')
  })

  test('takes a failed run as no diagram', () => expect(diagramOutcome(exited(1, '', 'Error: Empty input.\n'))).toBe(null))

  test('takes output from a failed run as no diagram', () => expect(diagramOutcome(exited(2, 'x'))).toBe(null))

  test('takes a run that did not start as no diagram', () => expect(diagramOutcome({ kind: 'rejected' })).toBe(null))
})
