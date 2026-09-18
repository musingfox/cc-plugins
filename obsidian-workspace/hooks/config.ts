import { unquote } from './yaml-scalar.ts'

function valueOf(raw: string) {
  const trimmed = raw.trim()
  const quoted = unquote(trimmed)
  const value = quoted !== trimmed ? quoted : trimmed.replace(/(^|\s+)#.*$/, '')
  return value || undefined
}

export function configOf(text: string): { vault?: string; project?: string } {
  let vault: string | undefined
  let project: string | undefined
  let inPm = false
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (/^\s*(#|$)/.test(line)) continue
    if (/^\S/.test(line)) {
      inPm = /^pm:\s*$/.test(line)
      if (/^vault:/.test(line)) vault = valueOf(line.slice('vault:'.length))
    } else if (inPm && /^\s+project:/.test(line)) {
      project = valueOf(line.replace(/^\s+project:/, ''))
    }
  }
  return { vault, project }
}
