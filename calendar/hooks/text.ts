// Everything the engine would refuse to draw, except the tab and newline a pane lays out with.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g
const LINE_MAX = 1000

export function drawable(text: string, max = 10000): string {
  const clean = text.replace(CONTROL, '')
  if (clean.length <= max) return clean
  // Copied from obsidian-workspace/hooks/bounds.ts: a cut must not leave a lone high surrogate before the ellipsis.
  let end = max - 1
  const last = clean.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return `${clean.slice(0, end)}…`
}

export function oneLine(text: string): string {
  return drawable(text, LINE_MAX).replace(/\s*[\n\t]+\s*/g, ' ').trim()
}
