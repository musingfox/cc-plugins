const CONTROLS_BUT_TAB_AND_NEWLINE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g

export function bounded(text: string, max = 10000) {
  const clean = text.replace(CONTROLS_BUT_TAB_AND_NEWLINE, '')
  if (clean.length <= max) return { text: clean, clippedFrom: null }
  let end = max
  const last = clean.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return { text: clean.slice(0, end), clippedFrom: clean.length }
}
