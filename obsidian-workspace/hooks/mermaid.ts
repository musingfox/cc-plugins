import type { Run } from './cli-output.ts'

// The allowlist below is what termaid 0.9.0 was measured to draw; a new pin means measuring it again.
export const TERMAID_ARGV = ['uvx', 'termaid@0.9.0', '--width', '80']

export const TERMAID_TIMEOUT_MS = 5_000

export type Segment = { kind: 'markdown'; text: string } | { kind: 'mermaid'; text: string; source: string }

type Fence = { char: string; length: number; indent: number; mermaid: boolean; text: string; content: string[] }

const OPENER = /^( {0,3})(`{3,}|~{3,})(.*)$/
const CLOSER = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

function openerOf(line: string): Fence | null {
  const match = OPENER.exec(line)
  if (!match) return null
  const [, indent, run, info] = match
  // CommonMark: a backtick run followed by a backtick in the info string is inline code, not a fence.
  if (run[0] === '`' && info.includes('`')) return null
  const mermaid = info.trim().split(/\s+/)[0] === 'mermaid'
  return { char: run[0], length: run.length, indent: indent.length, mermaid, text: '', content: [] }
}

function closes(fence: Fence, line: string) {
  const match = CLOSER.exec(line)
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length
}

function unindent(line: string, indent: number) {
  let cut = 0
  while (cut < indent && line[cut] === ' ') cut += 1
  return line.slice(cut)
}

// Every fence is tracked, so a mermaid opener inside another fence stays content; an unclosed fence is markdown.
export function splitFences(text: string): Segment[] {
  const segments: Segment[] = []
  let markdown = ''
  let fence: Fence | null = null
  const flush = () => {
    if (markdown) segments.push({ kind: 'markdown', text: markdown })
    markdown = ''
  }
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const bare = line.endsWith('\n') ? line.slice(0, -1) : line
    if (!fence) {
      fence = openerOf(bare)
      if (fence) fence.text = line
      else markdown += line
      continue
    }
    fence.text += line
    if (!closes(fence, bare)) {
      fence.content.push(unindent(bare, fence.indent))
      continue
    }
    if (fence.mermaid) {
      flush()
      segments.push({ kind: 'mermaid', text: fence.text, source: fence.content.join('\n') })
    } else {
      markdown += fence.text
    }
    fence = null
  }
  if (fence) markdown += fence.text
  flush()
  return segments
}

const TERMAID_HEADERS = new Set([
  'graph',
  'flowchart',
  'stateDiagram',
  'stateDiagram-v2',
  'sequenceDiagram',
  'classDiagram',
  'erDiagram',
  'block',
  'block-beta',
  'gitGraph',
  'gantt',
  'architecture',
  'architecture-beta',
  'pie',
  'treemap',
  'treemap-beta',
  'mindmap',
  'packet',
  'packet-beta',
  'xychart',
  'xychart-beta',
  'journey',
  'timeline',
  'kanban',
  'quadrantChart',
])

// termaid exits 0 with a wrong drawing on an unknown header or a leading %% line, so those never reach it.
export function termaidHeaderAllowed(source: string): boolean {
  const first = source.split('\n').find((line) => line.trim() !== '')
  return first !== undefined && TERMAID_HEADERS.has(first.trim().split(/\s+/)[0])
}

// termaid exits 0 with blank output on a syntax error, so only visible output counts as drawn.
export function diagramOutcome(run: Run): string | null {
  if (run.kind !== 'exited' || run.exitCode !== 0 || run.stdout.trim() === '') return null
  return run.stdout.trimEnd()
}
