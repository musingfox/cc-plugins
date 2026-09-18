import { unquote } from './yaml-scalar.ts'

export type CardHeader = { title?: string; status?: string; priority?: string }

export function headerOf(frontmatter: string): CardHeader {
  const header: CardHeader = {}
  for (const line of frontmatter.split('\n')) {
    const match = /^(title|status|priority):\s*(.*)$/.exec(line)
    if (!match) continue
    const value = unquote(match[2].trim())
    if (value) header[match[1] as keyof CardHeader] = value
  }
  return header
}
