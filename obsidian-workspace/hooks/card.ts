export function headerOf(frontmatter: string): { title?: string; status?: string; priority?: string } {
  const out: { title?: string; status?: string; priority?: string } = {}
  for (const line of frontmatter.split('\n')) { const m = /^(title|status|priority):\s*(.*)$/.exec(line); if (!m) continue; let value = m[2].trim(); if ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'")) value = value.slice(1,-1); if (value) out[m[1] as keyof typeof out] = value }
  return out
}
