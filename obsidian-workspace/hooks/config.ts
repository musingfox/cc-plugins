import { unquote } from './yaml-scalar.ts'

function valueOf(raw: string) {
  const value = unquote(raw.trim().replace(/\s+#.*$/, '').trim())
  return value || undefined
}

export function configOf(text: string): { vault?: string; project?: string } {
  let vault: string | undefined
  let project: string | undefined
  let inPm = false
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (/^vault:/.test(line)) vault = valueOf(line.slice('vault:'.length))
    else if (/^pm:\s*$/.test(line)) inPm = true
    else if (/^\S/.test(line)) inPm = false
    else if (inPm && /^\s+project:/.test(line)) project = valueOf(line.replace(/^\s+project:/, ''))
  }
  return { vault, project }
}
