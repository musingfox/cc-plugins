import { AC_HEADING, CHECKBOX } from './card.ts'
import { cardPathArgv } from './base-argv.ts'
import type { Scope } from './base-argv.ts'
import { isBadCardName, taskFolder } from './argv.ts'

const PATH_REFUSAL = 'The card path is not a card under pm/<project>/tasks/.'

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

// The write carries the text as base64 of UTF-8 JSON: no byte of the card is ever part of the JS source.
export function evalArgv(scope: Scope, path: string, text: string): { argv: string[] } | { refused: string } {
  const built = cardPathArgv(scope, path)
  if (!('argv' in built)) return { refused: PATH_REFUSAL }
  const folder = taskFolder(scope.project)
  if (!path.startsWith(folder) || isBadCardName(path.slice(folder.length, -'.md'.length))) return { refused: PATH_REFUSAL }
  const bytes = new TextEncoder().encode(JSON.stringify({ path, text }))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const payload = btoa(binary)
  const code = `(async () => { const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('${payload}'), (c) => c.charCodeAt(0)))); const f = app.vault.getAbstractFileByPath(p.path); if (!f) return 'ERR card not found: ' + p.path; await app.vault.modify(f, p.text); return 'OK' })()`
  return { argv: [built.argv[0], built.argv[1], 'eval', `code=${code}`] }
}

const CARD_FIELD = { type: 'string', description: 'The card file name under pm/<project>/tasks/, without .md.' }

export const PM_TOOLS = [
  {
    name: 'pm_tick',
    description: 'Tick or untick one acceptance-criteria checkbox of a pm task card. index counts the checkboxes under its ## Acceptance Criteria heading from 1.',
    inputSchema: {
      type: 'object',
      properties: { card: CARD_FIELD, index: { type: 'integer', description: 'The 1-based checkbox number under ## Acceptance Criteria.' }, checked: { type: 'boolean' } },
      required: ['card', 'index', 'checked'],
    },
    isDeferred: false,
  },
  {
    name: 'pm_note',
    description: 'Append one line as a bullet at the end of a pm task card Notes section, creating the section when it is missing.',
    inputSchema: { type: 'object', properties: { card: CARD_FIELD, line: { type: 'string', description: 'One line of text, without line breaks.' } }, required: ['card', 'line'] },
    isDeferred: false,
  },
  {
    name: 'pm_status',
    description: 'Set the status of a pm task card in its frontmatter.',
    inputSchema: { type: 'object', properties: { card: CARD_FIELD, status: { type: 'string', enum: STATUSES } }, required: ['card', 'status'] },
    isDeferred: false,
  },
]

const CARD_REFUSAL = 'The card name must be a file name without /, control characters or dots alone.'
const ARGUMENT_REFUSAL = 'The arguments do not match the tool: a checkbox index is a whole number, checked is true or false, and status is one of the four values.'

// What a pm tool call changes, checked before any CLI run; `apply` makes the edit once the card has been read.
export function pmEdit(tool: string, event: Record<string, unknown>): { card: string; apply: (text: string) => Edit } | { refused: string } {
  const { card } = event
  if (typeof card !== 'string' || isBadCardName(card)) return { refused: CARD_REFUSAL }
  if (tool === 'pm_tick') {
    const { index, checked } = event
    if (typeof index !== 'number' || !Number.isInteger(index) || typeof checked !== 'boolean') return { refused: ARGUMENT_REFUSAL }
    return { card, apply: (text) => tickAc(text, index, checked) }
  }
  if (tool === 'pm_note') {
    const { line } = event
    if (typeof line !== 'string' || lineProblem(line)) return { refused: LINE_REFUSAL }
    return { card, apply: (text) => appendNote(text, line) }
  }
  const { status } = event
  if (typeof status !== 'string' || !STATUSES.includes(status)) return { refused: ARGUMENT_REFUSAL }
  return { card, apply: (text) => setStatus(text, status) }
}
