import { unquote } from './yaml-scalar.ts'

export type CardHeader = { title?: string; status?: string; priority?: string }

export function headerOf(frontmatter: string): CardHeader {
  const header: CardHeader = {}
  for (const line of frontmatter.split('\n')) {
    // `s`: a value may hold a carriage return; drawing strips it, parsing must not drop the line.
    const match = /^(title|status|priority):\s*(.*)$/s.exec(line)
    if (!match) continue
    const value = unquote(match[2].trim())
    if (value) header[match[1] as keyof CardHeader] = value
  }
  return header
}

const AC_HEADING = /^## acceptance criteria\s*$/i
const CHECKBOX = /^\s*[-*+] \[( |x|X)\](\s|$)/

// The section runs to the next `#` or `##` heading; a `###` subheading stays inside it.
export function acLabel(body: string): string | null {
  const lines = body.split('\n')
  const start = lines.findIndex((line) => AC_HEADING.test(line))
  if (start < 0) return null
  let checked = 0
  let total = 0
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('# ') || line.startsWith('## ')) break
    const box = CHECKBOX.exec(line)
    if (!box) continue
    total += 1
    if (box[1] !== ' ') checked += 1
  }
  return total ? `AC ${checked}/${total}` : null
}
