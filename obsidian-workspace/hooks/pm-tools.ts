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
