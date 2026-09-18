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
