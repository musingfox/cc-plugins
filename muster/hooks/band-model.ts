import type { RunState } from '../types/index.d.ts'

export type RunFacts = { phase: string | undefined; files?: string[]; report?: string }

const numbersOf = (files: string[], pattern: RegExp): string[] =>
  files.flatMap((file) => {
    const match = pattern.exec(file)
    return match ? [match[1]] : []
  })

// A question is open while no ANSWER-n.json names its number; a temporary write matches neither pattern.
const hasOpenQuestion = (files: string[]): boolean => {
  const answered = new Set(numbersOf(files, /^ANSWER-(\d+)\.json$/))
  return numbersOf(files, /^QUESTION-(\d+)\.json$/).some((n) => !answered.has(n))
}

// The band's own copy of the state rules, after src/status.ts. Three differences are deliberate: an open question
// beats a BLOCKED report here (status.ts reports blocked), the band ignores fetched and pid, and the caller
// trims the report's first line (board.ts) before it arrives here.
export function classifyRun({ phase, files = [], report }: RunFacts): RunState {
  if (phase !== 'exited' && hasOpenQuestion(files)) return 'question'
  if (report === 'DONE') return 'done'
  if (report === 'BLOCKED') return 'blocked'
  if (report !== undefined) return 'malformed'
  switch (phase) {
    case 'starting':
    case 'running':
    case 'idle':
    case 'exited':
      return phase
    case 'question':
      return 'running'
    default:
      return 'exited'
  }
}
