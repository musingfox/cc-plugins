import type { RunRow, TreeGroup } from '../types/index.d.ts'

// Issues sort by their text with runs dispatched without one last; within an issue the oldest run comes first.
export function groupByIssue(runs: RunRow[]): TreeGroup[] {
  const groups = new Map<string | null, RunRow[]>()
  for (const run of runs) groups.set(run.issue, [...(groups.get(run.issue) ?? []), run])
  const order = (a: string | null, b: string | null) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b))
  return [...groups.entries()]
    .sort(([a], [b]) => order(a, b))
    .map(([issue, members]) => ({ issue, runs: [...members].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name)) }))
}

// An exited run left no report, so its exit reason is the only account of how it ended.
export const treeStateLabel = (run: Pick<RunRow, 'state' | 'exitReason'>): string =>
  run.state === 'question' ? '? question' : run.state === 'exited' && run.exitReason ? `exited · ${run.exitReason}` : run.state

export const issueKey = (issue: string | null): string => `issue:${issue ?? ''}`
export const runKey = (name: string): string => `run:${name}`

// The Buttons the pane draws, top to bottom: a folded issue keeps its header and hides its runs.
export function drawnKeys(groups: TreeGroup[], folded: string[]): string[] {
  return groups.flatMap((group) => {
    const key = issueKey(group.issue)
    return folded.includes(key) ? [key] : [key, ...group.runs.map((run) => runKey(run.name))]
  })
}

type Arrow = { origin: { kind: string }; by: number; pointer?: unknown }

// A person's single arrow press walks the drawn Buttons; the wheel, page keys and a plugin's scroll keep the engine's scrolling.
export function arrowTarget(scroll: Arrow, keys: string[], at: string | null): string | null {
  if (scroll.origin.kind !== 'person' || scroll.pointer !== undefined || Math.abs(scroll.by) !== 1) return null
  const index = at === null ? -1 : keys.indexOf(at)
  if (index === -1) return scroll.by > 0 ? (keys[0] ?? null) : null
  return keys[index + scroll.by] ?? null
}

// After src/status.ts: a BLOCKED report's body, whitespace folded, is its reason.
export function reportOf(text: string | null): { report: string | null; reason: string | null } {
  if (text === null) return { report: null, reason: null }
  const [first = '', ...body] = text.split('\n')
  const report = first.trim()
  const reason = body.join('\n').trim().replace(/\s*\n\s*/g, ' ')
  return { report, reason: report === 'BLOCKED' && reason !== '' ? reason : null }
}

export function openQuestions(files: string[]): number[] {
  const numbers = (pattern: RegExp) => files.flatMap((name) => {
    const match = pattern.exec(name)
    return match ? [Number(match[1])] : []
  })
  const answered = new Set(numbers(/^ANSWER-(\d+)\.json$/))
  return numbers(/^QUESTION-(\d+)\.json$/).filter((n) => !answered.has(n)).sort((a, b) => a - b)
}

const ACTIVITY_LIMIT = 10
const ACTIVITY_WIDTH = 120

// events.jsonl is the raw ACP stream; a tool's title and a permission decision are the lines a person can read, so the
// rest is dropped. Only tool_call_update carries the real title: tool_call opens with a placeholder such as "Terminal".
// Commands open with the worktree's absolute path, so it reads as "." and a leading "cd . &&" goes.
export function activityOf(text: string, worktree?: string): string[] {
  const picked: string[] = []
  for (const raw of text.split('\n')) {
    let event: any
    try {
      event = JSON.parse(raw)
    } catch {
      continue
    }
    const update = event?.msg?.params?.update
    // A policy allow is muster's routine auto-approval; denials and the coordinator's answers are what a person looks for.
    const isRoutine = event?.msg?.decision === 'allow' && event?.msg?.by === 'policy'
    const entry =
      event?.dir === 'client-decision' && typeof event.msg?.decision === 'string' && !isRoutine
        ? `permission ${event.msg.decision}${typeof event.msg.by === 'string' ? ` by ${event.msg.by}` : ''}`
        : update?.sessionUpdate === 'tool_call_update' && typeof update.title === 'string' && update.title.trim() !== ''
          ? update.title.trim()
          : null
    if (entry === null) continue
    const local = worktree ? entry.split(worktree).join('.').replace(/^cd \. && /, '') : entry
    const clipped = local.replace(/\s+/g, ' ').slice(0, ACTIVITY_WIDTH)
    if (picked[picked.length - 1] !== clipped) picked.push(clipped)
  }
  return picked.slice(-ACTIVITY_LIMIT)
}
