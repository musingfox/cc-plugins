import { AC_HEADING, CHECKBOX } from './card.ts'

export type Edit = { text: string } | { refused: string }

// The body is what follows the frontmatter's closing `---`; a note without one is all body.
function bodyStart(lines: string[]) {
  if (lines[0] !== '---') return 0
  const close = lines.indexOf('---', 1)
  return close < 0 ? 0 : close + 1
}

const NO_BOX = 'index must name one acceptance-criteria checkbox of the card.'

export function tickAc(text: string, index: number, checked: boolean): Edit {
  if (!Number.isInteger(index) || index < 1) return { refused: NO_BOX }
  const lines = text.split('\n')
  const start = bodyStart(lines)
  const heading = lines.findIndex((line, at) => at >= start && AC_HEADING.test(line))
  if (heading < 0) return { refused: NO_BOX }
  let seen = 0
  for (let at = heading + 1; at < lines.length; at++) {
    const line = lines[at]
    if (line.startsWith('# ') || line.startsWith('## ')) break
    if (!CHECKBOX.test(line)) continue
    seen += 1
    if (seen !== index) continue
    const mark = line.indexOf('[') + 1
    lines[at] = `${line.slice(0, mark)}${checked ? 'x' : ' '}${line.slice(mark + 1)}`
    return { text: lines.join('\n') }
  }
  return { refused: NO_BOX }
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
export const LINE_REFUSAL = 'line must be one line of text.'

export function lineProblem(line: string): string | null {
  return line.trim() === '' || CONTROL.test(line) ? LINE_REFUSAL : null
}

// The Notes section runs to the next `#` or `##` heading, as the acceptance-criteria section does.
export function appendNote(text: string, line: string): Edit {
  if (lineProblem(line)) return { refused: LINE_REFUSAL }
  const lines = text.split('\n')
  const heading = lines.findIndex((value) => /^## Notes\s*$/.test(value))
  if (heading < 0) return { text: `${text}${text.endsWith('\n') ? '\n' : '\n\n'}## Notes\n- ${line}\n` }
  let end = heading + 1
  while (end < lines.length && !lines[end].startsWith('# ') && !lines[end].startsWith('## ')) end++
  let last = heading
  for (let at = heading + 1; at < end; at++) if (lines[at].trim() !== '') last = at
  lines.splice(last + 1, 0, `- ${line}`)
  return { text: lines.join('\n') }
}

export const STATUSES = ['todo', 'in-progress', 'blocked', 'done']
const STATUS_REFUSAL = `status must be one of ${STATUSES.join(', ')}.`
const NO_STATUS = 'The card has no top-level status: line in its frontmatter.'

export function setStatus(text: string, status: string): Edit {
  if (!STATUSES.includes(status)) return { refused: STATUS_REFUSAL }
  const lines = text.split('\n')
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  if (close < 0) return { refused: NO_STATUS }
  const at = lines.slice(0, close).findIndex((line) => /^status:/.test(line))
  if (at < 0) return { refused: NO_STATUS }
  lines[at] = `status: ${status}`
  return { text: lines.join('\n') }
}

// An empty frontmatter would make the rebuilt card gain a byte, so the rebuild refuses it.
export function cardText(card: { frontmatter: string; body: string }): { text: string } | { refused: string } {
  if (card.frontmatter === '') return { refused: 'The card has no frontmatter to rebuild exactly.' }
  return { text: `---\n${card.frontmatter}\n---\n${card.body}` }
}
