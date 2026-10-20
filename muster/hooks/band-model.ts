import type { BandRow, LiveState, RunState } from '../types/index.d.ts'

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

export type Figures = { title: string; plan: { done: number; total: number } | null; tools: number; cost: number | null }

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

// Whatever phase.json holds, the band draws these fallbacks instead of a bad value.
export function figuresOf(phase: unknown): Figures {
  const fields = typeof phase === 'object' && phase !== null ? (phase as Record<string, unknown>) : {}
  const { title, plan, tools, cost } = fields
  const shown = typeof plan === 'object' && plan !== null ? (plan as Record<string, unknown>) : {}
  const counted = isCount(shown.done) && isCount(shown.total) && shown.total > 0
  return {
    title: typeof title === 'string' && title.trim() !== '' ? title : '(no title yet)',
    plan: counted ? { done: Math.min(shown.done as number, shown.total as number), total: shown.total as number } : null,
    tools: isCount(tools) ? tools : 0,
    cost: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
  }
}

export const stateLabel = (state: RunState): string => (state === 'question' ? '? question' : state)

// The theme keys the band paints each state with.
export const STATE_COLOR: Record<RunState, string> = {
  starting: 'inactive',
  running: 'suggestion',
  question: 'warning',
  idle: 'permission',
  done: 'success',
  blocked: 'error',
  malformed: 'error',
  exited: 'inactive',
}

export const progressCell = (row: Pick<BandRow, 'plan' | 'tools'>): { text: string; dim: boolean } =>
  row.plan ? { text: `${row.plan.done}/${row.plan.total}`, dim: false } : { text: `${row.tools} tools`, dim: true }

export const costText = (cost: number | null): string =>
  cost === null ? '' : `  $${cost.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

// The header's words for the rows on the band and the runs waiting to be collected; a zero count is left out.
export function summaryParts(rows: { state: RunState | LiveState }[], collect: number): string[] {
  const count = (...states: string[]) => rows.filter((row) => states.includes(row.state)).length
  const parts = [
    [count('starting', 'running'), 'running'],
    [count('question'), 'question'],
    [count('idle'), 'idle'],
    [collect, 'to collect'],
  ] as const
  return parts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`)
}
