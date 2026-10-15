export type RawCard = Record<string, unknown>

// The index of the bracket closing the one at `start`, skipping brackets inside JSON strings; -1 when it never closes.
function closeOf(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') {
      inString = true
    } else if (c === '[') {
      depth++
    } else if (c === ']' && --depth === 0) {
      return i
    }
  }
  return -1
}

const isObject = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

// A subagent may wrap its array in prose or a fence, so the first bracketed span that parses as an array of objects wins.
export function parseReply(answer: string): RawCard[] | null {
  for (let start = answer.indexOf('['); start !== -1; start = answer.indexOf('[', start + 1)) {
    const end = closeOf(answer, start)
    if (end === -1) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(answer.slice(start, end + 1))
    } catch {
      continue
    }
    if (Array.isArray(parsed) && parsed.every(isObject)) return parsed as RawCard[]
  }
  return null
}
