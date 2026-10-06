import { renderMermaidAscii } from './vendor/mermaid-ascii.js'

// Pure functions over mermaid blocks: finding them in a message's markdown,
// drawing them as box art, fitting the art to a width, and
// serializing it for the transcript. No `$`, so tests call them directly.

export type MermaidBlock = {
  /** the whole fence, opening line through closing line, its indentation included */
  start: number
  end: number
  /** what the fence's lines are indented by (a fence inside a list item) */
  indent: string
  source: string
}

export type Rendered = { lines: string[] } | { error: string }

export type Fitted = { lines: string[]; width: number; overflow: number }

// closing fence must sit alone on its line; an unclosed fence (mid-stream)
// is not a block yet. The info string is `mermaid` as a whole word, so
// `mermaidjs` is some other language
const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*mermaid(?![\w-])[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*$/gim

export const mermaidBlocksOf = (text: string): MermaidBlock[] => {
  const blocks: MermaidBlock[] = []
  for (const match of text.matchAll(FENCE)) {
    const source = (match[3] ?? '').replace(/\r\n?/g, '\n').trim()
    if (source === '') continue
    const start = match.index ?? 0
    blocks.push({ start, end: start + match[0].length, indent: match[1] ?? '', source })
  }
  return blocks
}

const KINDS: [RegExp, string][] = [
  [/^(flowchart|graph)\b/i, 'flowchart'],
  [/^sequenceDiagram/i, 'sequence'],
  [/^classDiagram/i, 'class'],
  [/^stateDiagram/i, 'state'],
  [/^erDiagram/i, 'er'],
  [/^xychart/i, 'chart'],
  [/^gantt/i, 'gantt'],
  [/^pie\b/i, 'pie'],
  [/^mindmap/i, 'mindmap'],
  [/^gitGraph/i, 'gitgraph'],
  [/^journey/i, 'journey'],
  [/^timeline/i, 'timeline'],
  [/^quadrantChart/i, 'quadrant'],
  [/^requirementDiagram/i, 'requirement'],
  [/^C4/, 'c4'],
  [/^sankey/i, 'sankey'],
  [/^block/i, 'block'],
  [/^packet/i, 'packet'],
  [/^kanban/i, 'kanban'],
  [/^architecture/i, 'architecture'],
]

// what the renderer draws; the rest keep their fence. ER is left out: the
// renderer mangles its relationship edges (a second relation detaches)
export const DRAWN_KINDS: ReadonlySet<string> = new Set(['flowchart', 'sequence', 'class', 'state', 'chart'])

// front matter and %% comments precede the header
const headerOf = (source: string): string => {
  const lines = source.split('\n').map(line => line.trim())
  let i = 0
  if (lines[0] === '---') {
    i = lines.indexOf('---', 1) + 1
    if (i === 0) i = lines.length
  }
  return lines.slice(i).find(line => line !== '' && !line.startsWith('%%')) ?? ''
}

export const kindOf = (source: string): string => {
  const head = headerOf(source)
  return KINDS.find(([pattern]) => pattern.test(head))?.[1] ?? 'diagram'
}

// a source past this is not drawn: the layout is quadratic in places
export const MAX_SOURCE_CHARS = 12_000

// the renderer draws a state diagram's `[*]` start and end as an empty
// corner-dotted box; a diagram with other transitions reads better without
export const withoutPseudoStates = (source: string): string => {
  if (kindOf(source) !== 'state') return source
  const kept = source.split('\n').filter(line => !line.includes('[*]'))
  return kept.some(line => line.includes('-->')) ? kept.join('\n') : source
}

// Rows are dear in a terminal and columns are cheap: a top-down flowchart or
// state diagram laid out left to right is a fraction of the height. Null
// when the source already picks a sideways direction, or the kind ignores one
export const leftToRightOf = (source: string): string | null => {
  const kind = kindOf(source)
  if (kind === 'flowchart') {
    const header = /^(\s*(?:flowchart|graph))(?:\s+(TD|TB|BT|LR|RL))?\b([^\n]*)$/im.exec(source)
    if (!header || header[2] === 'LR' || header[2] === 'RL') return null
    return source.replace(header[0], `${header[1]} LR${header[3]}`)
  }
  if (kind === 'state') {
    if (/^\s*direction\s+/im.test(source)) return null
    return source.replace(/^([^\n]*stateDiagram[^\n]*)$/im, '$1\n  direction LR')
  }
  return null
}

const tokensOf = (lines: readonly string[]): Map<string, number> => {
  const out = new Map<string, number>()
  for (const line of lines) for (const token of line.match(/[\p{L}\p{N}_+#-]+/gu) ?? []) out.set(token, (out.get(token) ?? 0) + 1)
  return out
}

// the sideways layout wins when every word of the original survives (the
// renderer can overwrite the label of an edge that runs back the other way)
// and it fits, or is at least no wider than the original
export const pickLayout = (base: Rendered, sideways: Rendered, columns: number): Rendered => {
  if (!('lines' in base) || !('lines' in sideways)) return base
  const have = tokensOf(sideways.lines)
  for (const [token, count] of tokensOf(base.lines)) if ((have.get(token) ?? 0) < count) return base
  const width = widthOf(sideways.lines)
  return width <= columns || width <= widthOf(base.lines) ? sideways : base
}

// East Asian Wide and Fullwidth characters take two terminal columns
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}\p{Emoji_Presentation}]/u

const cellsOf = (char: string): number => (WIDE.test(char) ? 2 : 1)

export const displayWidth = (text: string): number => {
  let width = 0
  for (const char of text) width += cellsOf(char)
  return width
}

// The renderer sizes boxes by string length, one column per character, so a
// wide label overflows its box. Each wide character goes in as two narrow
// letters (a marker naming it, then a filler) and comes back out after: the
// box is sized for two columns. Letters, not private-use characters, because
// state names must still parse as \p{L}. Canadian syllabics are the stand-ins.
const MARKER_BASE = 0x1401
const MARKER_COUNT = 0x166d - MARKER_BASE
const FILLER = '\u166f'
const STAND_IN = /[\u1401-\u167f]/
const ENCODED = /([\u1401-\u166c])\u166f/g
const WIDE_ALL = new RegExp(WIDE.source, 'gu')

type Encoded = { source: string; decode: (art: string) => string | null }

const encodedWide = (source: string): Encoded | null => {
  if (!WIDE.test(source)) return { source, decode: art => art }
  if (STAND_IN.test(source)) return null
  const wide: string[] = []
  const encoded = source.replace(WIDE_ALL, char => {
    let i = wide.indexOf(char)
    if (i < 0) i = wide.push(char) - 1
    return String.fromCharCode(MARKER_BASE + i) + FILLER
  })
  if (wide.length > MARKER_COUNT) return null
  return {
    source: encoded,
    decode: art => {
      const out = art.replace(ENCODED, (_, marker: string) => wide[marker.charCodeAt(0) - MARKER_BASE]!)
      return STAND_IN.test(out) ? null : out
    },
  }
}

// the renderer's tightest padding: a fraction of the default width and height,
// for a diagram that does not fit the transcript at the default
const COMPACT = { paddingX: 1, paddingY: 0, boxBorderPadding: 0 } as const

export const renderOf = (source: string, useAscii: boolean, compact = false): Rendered => {
  const kind = kindOf(source)
  if (!DRAWN_KINDS.has(kind)) return { error: `${kind} diagrams are not drawn yet` }
  if (source.length > MAX_SOURCE_CHARS) return { error: `too big to draw (${source.length} characters)` }
  const encoded = encodedWide(source)
  if (!encoded) return { error: 'wide characters could not be measured' }
  try {
    const art = encoded.decode(renderMermaidAscii(encoded.source, { useAscii, colorMode: 'none', ...(compact ? COMPACT : {}) }))
    if (art === null) return { error: 'wide characters could not be measured' }
    const lines = art.split('\n').map(line => line.replace(/ +$/, ''))
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    while (lines.length > 0 && lines[0] === '') lines.shift()
    return lines.length === 0 ? { error: 'nothing to draw' } : { lines }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export const widthOf = (lines: readonly string[]): number => lines.reduce((max, line) => Math.max(max, displayWidth(line)), 0)

// lines wider than `columns` are cut with an ellipsis; `overflow` says by how much
export const fitLines = (lines: readonly string[], columns: number): Fitted => {
  const width = widthOf(lines)
  const room = Math.max(1, columns)
  if (width <= room) return { lines: [...lines], width, overflow: 0 }
  const fitted = lines.map(line => {
    if (displayWidth(line) <= room) return line
    let out = ''
    let used = 0
    for (const char of line) {
      if (used + cellsOf(char) > room - 1) break
      out += char
      used += cellsOf(char)
    }
    return out + '…'
  })
  return { lines: fitted, width, overflow: width - room }
}

// the message's markdown with each mermaid fence swapped for a text fence of its
// art, so the transcript draws the diagram in place; a block that fails to
// render keeps its fence. The art keeps the fence's indentation, so a diagram
// inside a list item stays in it
export const inlineTextOf = (
  text: string,
  blocks: readonly MermaidBlock[],
  artOf: (block: MermaidBlock) => string[] | null,
): string => {
  let out = ''
  let cursor = 0
  for (const block of blocks) {
    const art = artOf(block)
    out += text.slice(cursor, block.start)
    out += art
      ? [block.indent + '```text', ...art.map(line => block.indent + line), block.indent + '```'].join('\n')
      : text.slice(block.start, block.end)
    cursor = block.end
  }
  return out + text.slice(cursor)
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// a page that draws each source with mermaid in the browser, for a diagram the
// transcript had to cut
export const htmlOf = (sources: readonly string[]): string =>
  [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>mermaid-inline</title>',
    '<style>body{font-family:system-ui,sans-serif;margin:24px} pre.mermaid{margin:0 0 48px}</style>',
    '</head><body>',
    ...sources.map(source => `<pre class="mermaid">\n${escapeHtml(source)}\n</pre>`),
    // the single-file build: the ESM one loads each diagram kind as another chunk
    '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>',
    '<script>mermaid.initialize({ startOnLoad: true })</script>',
    '</body></html>',
  ].join('\n')
