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

// Minutes round to the nearest, and carry into hours so 3599 s reads 1h0m, never 60m.
export function elapsedText(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

// Null when the start does not parse; an end that does not parse is treated the same way.
export function elapsedSeconds(startedIso: string, endedIso: string | null, nowMs: number): number | null {
  const started = Date.parse(startedIso)
  const ended = endedIso === null ? nowMs : Date.parse(endedIso)
  if (Number.isNaN(started) || Number.isNaN(ended)) return null
  return Math.max(0, Math.round((ended - started) / 1000))
}
