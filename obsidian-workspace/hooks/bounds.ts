export function bounded(text: string, max = 10000) {
  const clean = text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
  if (clean.length <= max) return { text: clean, clippedFrom: null }
  let end = max
  const unit = clean.charCodeAt(end - 1)
  if (unit >= 0xd800 && unit <= 0xdbff) end -= 1
  return { text: clean.slice(0, end), clippedFrom: clean.length }
}
