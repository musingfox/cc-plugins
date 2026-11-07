import type { Activity, PlanEntry, RunRow, TreeGroup } from '../types/index.d.ts'

// Issues sort by their text with runs dispatched without one last; within an issue the oldest run comes first.
export function groupByIssue(runs: RunRow[]): TreeGroup[] {
  const groups = new Map<string | null, RunRow[]>()
  for (const run of runs) groups.set(run.issue, [...(groups.get(run.issue) ?? []), run])
  const order = (a: string | null, b: string | null) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b))
  return [...groups.entries()]
    .sort(([a], [b]) => order(a, b))
    .map(([issue, members]) => ({ issue, runs: [...members].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name)) }))
}

export const issueKey = (issue: string | null): string => `issue:${issue ?? ''}`
export const runKey = (name: string): string => `run:${name}`

export const openKey = (issue: string): string => `open:${issue}`
export const askKey = (name: string): string => `ask:${name}`

// The issue reaches the system `open` as given, so only a link that names a web page or an Obsidian note is offered:
// a path or a file: URL would launch whatever it names.
export const isOpenable = (issue: string): boolean => /^(https?|obsidian):\/\/\S+$/i.test(issue)

// The Buttons the pane draws, top to bottom: a folded issue keeps its header and hides its runs; the selected run's
// hand-off Button sits under it; the Open issue Button follows its header where the surface can run `open`.
export function drawnKeys(groups: TreeGroup[], folded: string[], selected: string | null, canOpen: boolean): string[] {
  return groups.flatMap((group) => {
    const key = issueKey(group.issue)
    const head = [key, ...(canOpen && group.issue !== null && isOpenable(group.issue) ? [openKey(group.issue)] : [])]
    if (folded.includes(key)) return head
    return [...head, ...group.runs.flatMap((run) => [runKey(run.name), ...(run.name === selected ? [askKey(run.name)] : [])])]
  })
}

// The line the hand-off puts in the coordinator's prompt; the person finishes it and sends it, or not.
export const handOffText = (run: Pick<RunRow, 'name' | 'state' | 'issue'>): string =>
  `muster run ${run.name} (${run.state}${run.issue ? `, issue ${run.issue}` : ''}): `

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

const SAID_LIMIT = 3
const DENIED_LIMIT = 3
const SAID_WIDTH = 240

// events.jsonl is the raw ACP stream. A person reads a run by its plan and the worker's own words; its commands are
// noise, so they are dropped. A message streams as chunks, and anything but a usage tick between two chunks ends it.
// A policy allow is muster's routine approval and a coordinator's allow is already known to it, so only refusals stay.
// Paths open with the worktree's absolute path, so it reads as ".".
export function activityOf(text: string, worktree?: string): Activity {
  let plan: PlanEntry[] | null = null
  const said: string[] = []
  const denied: string[] = []
  let speaking = false
  const local = (entry: string) => (worktree ? entry.split(worktree).join('.') : entry).replace(/\s+/g, ' ').trim()
  for (const raw of text.split('\n')) {
    let event: any
    try {
      event = JSON.parse(raw)
    } catch {
      continue
    }
    const update = event?.msg?.params?.update
    const kind = update?.sessionUpdate
    if (kind === 'usage_update') continue
    if (kind === 'agent_message_chunk' && typeof update.content?.text === 'string') {
      if (speaking) said[said.length - 1] += update.content.text
      else said.push(update.content.text)
      speaking = true
      continue
    }
    speaking = false
    if (kind === 'plan' && Array.isArray(update.entries)) {
      plan = update.entries.flatMap((entry: any) =>
        typeof entry?.content === 'string' && ['completed', 'in_progress', 'pending'].includes(entry.status) ? [{ status: entry.status, content: local(entry.content) }] : [],
      )
    } else if (event?.dir === 'client-decision' && typeof event.msg?.decision === 'string' && event.msg.decision !== 'allow') {
      denied.push(`permission ${event.msg.decision}${typeof event.msg.by === 'string' ? ` by ${event.msg.by}` : ''}`)
    }
  }
  return {
    plan: plan === null || plan.length === 0 ? null : planFocus(plan),
    said: said.map(local).filter((entry) => entry !== '').slice(-SAID_LIMIT).map((entry) => entry.slice(0, SAID_WIDTH)),
    denied: denied.slice(-DENIED_LIMIT),
  }
}

// Where the worker stands: the step it last finished, the steps under way, and the one it takes up next.
function planFocus(entries: PlanEntry[]): NonNullable<Activity['plan']> {
  const lastDone = entries.map((entry) => entry.status).lastIndexOf('completed')
  const nextPending = entries.findIndex((entry) => entry.status === 'pending')
  const shown = entries.filter((entry, i) => entry.status === 'in_progress' || i === lastDone || i === nextPending)
  return { done: entries.filter((entry) => entry.status === 'completed').length, total: entries.length, shown }
}
