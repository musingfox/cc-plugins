import type { BandRow, Board, RunDetail, RunRow, RunState } from '../types/index.d.ts'
import { classifyRun, elapsedSeconds, figuresOf } from './band-model.ts'
import { activityOf, openQuestions, reportOf } from './tree-model.ts'

const LIVE: ReadonlySet<RunState> = new Set(['starting', 'running', 'question', 'idle'])
const COLLECT: ReadonlySet<RunState> = new Set(['done', 'blocked', 'malformed'])

const trimSlashes = (path: string): string => path.replace(/\/+$/, '')

function readText($: any, path: string): Promise<string | null> {
  return Promise.resolve($.fs.read(path)).then((text: unknown) => (typeof text === 'string' ? text : null), () => null)
}

function objectOf(text: string | null): Record<string, unknown> | null {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// The directory muster writes runs to: MUSTER_HOME, or HOME's cache; an empty variable counts as unset.
export async function runsRootOf($: any): Promise<string | null> {
  try {
    const muster = await $.env.get('MUSTER_HOME')
    const home = await $.env.get('HOME')
    const base = muster || (home ? `${home}/.cache/muster` : null)
    return base ? `${base}/runs` : null
  } catch {
    return null
  }
}

// Reads meta.json first and drops another repo's run before touching anything else. Null skips the run.
async function runOf($: any, dir: string, name: string, root: string, now: number): Promise<RunRow | null> {
  try {
    const meta = objectOf(await readText($, `${dir}/meta.json`))
    if (!meta || typeof meta.repoRoot !== 'string' || trimSlashes(meta.repoRoot) !== root) return null
    const seconds = typeof meta.started === 'string' ? elapsedSeconds(meta.started, null, now) : null
    const phase = objectOf(await readText($, `${dir}/phase.json`))
    if (!phase || seconds === null) return null
    const files = (await $.fs.list(dir)).map((entry: { name: string }) => entry.name)
    const report = await readText($, `${dir}/REPORT.md`)
    const state = classifyRun({
      phase: typeof phase.phase === 'string' ? phase.phase : undefined,
      files,
      report: report === null ? undefined : report.split('\n')[0].trim(),
    })
    const figures = figuresOf(phase)
    return {
      name,
      state,
      title: figures.title,
      plan: figures.plan,
      tools: figures.tools,
      cost: figures.cost,
      seconds,
      issue: typeof meta.issue === 'string' && meta.issue.trim() !== '' ? meta.issue : null,
      exitReason: phase.phase === 'exited' && typeof phase.reason === 'string' ? phase.reason : null,
    }
  } catch {
    return null
  }
}

// Every readable run of this repository, whatever its state; null when the runs directory cannot be listed. Never throws.
export async function readRuns($: any): Promise<RunRow[] | null> {
  try {
    const runsRoot = await runsRootOf($)
    if (runsRoot === null) return null
    const root = trimSlashes(await $.session.root())
    const now = await $.clock.now()
    const entries: { name: string; kind: string }[] = await $.fs.list(runsRoot)
    const runs = await Promise.all(entries.filter((entry) => entry.kind === 'dir').map((entry) => runOf($, `${runsRoot}/${entry.name}`, entry.name, root, now)))
    return runs.filter((run): run is RunRow => run !== null)
  } catch {
    return null
  }
}

// The runs in flight and how many wait to be collected; null when none is in flight.
export function boardOf(runs: RunRow[] | null): Board | null {
  if (runs === null) return null
  const rows: BandRow[] = runs.flatMap((run) =>
    LIVE.has(run.state)
      ? [{ name: run.name, state: run.state as BandRow['state'], title: run.title, plan: run.plan, tools: run.tools, cost: run.cost, seconds: run.seconds }]
      : [],
  )
  if (rows.length === 0) return null
  return { rows, collect: runs.filter((run) => COLLECT.has(run.state)).length }
}

// The runs of this repository in flight and how many wait to be collected; null when none is in flight. Never throws.
export async function readBoard($: any): Promise<Board | null> {
  return boardOf(await readRuns($))
}

// $.fs.read rejects a file over 4 MiB and events.jsonl is the raw ACP stream, so only its tail is read, and only again
// once the file's size or time changed. The first line of the tail is usually cut and fails to parse, which drops it.
const EVENTS_TAIL_BYTES = 1048576
const CACHE_LIMIT = 50
const activityCache = new Map<string, { size: number; mtimeMs: number; activity: string[] }>()

async function recentActivity($: any, path: string, entry: { size: number; mtimeMs: number } | undefined, worktree: string): Promise<string[] | null> {
  if (entry === undefined) return []
  const cached = activityCache.get(path)
  if (cached && cached.size === entry.size && cached.mtimeMs === entry.mtimeMs) return cached.activity
  try {
    const { exitCode, stdout } = await $.process.run(['tail', '-c', String(EVENTS_TAIL_BYTES), path], { timeoutMs: 5000 })
    if (exitCode !== 0 || typeof stdout !== 'string') return null
    const activity = activityOf(stdout, worktree)
    if (activityCache.size >= CACHE_LIMIT) activityCache.clear()
    activityCache.set(path, { size: entry.size, mtimeMs: entry.mtimeMs, activity })
    return activity
  } catch {
    return null
  }
}

// One run's report, open questions and recent activity, read when the pane shows its detail; null when the run is gone. Never throws.
export async function readDetail($: any, name: string): Promise<RunDetail | null> {
  try {
    if (name === '' || name.includes('/') || name === '.' || name === '..') return null
    const runsRoot = await runsRootOf($)
    if (runsRoot === null) return null
    const dir = `${runsRoot}/${name}`
    const entries: { name: string; size: number; mtimeMs: number }[] = await $.fs.list(dir)
    const files = entries.map((entry) => entry.name)
    const meta = objectOf(await readText($, `${dir}/meta.json`))
    const questions = await Promise.all(
      openQuestions(files).map(async (n) => {
        const paths = objectOf(await readText($, `${dir}/QUESTION-${n}.json`))?.paths
        return { n, paths: Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : [] }
      }),
    )
    const worktree = typeof meta?.worktree === 'string' ? meta.worktree : `${dir}/worktree`
    return {
      name,
      ...reportOf(await readText($, `${dir}/REPORT.md`)),
      questions,
      activity: await recentActivity($, `${dir}/events.jsonl`, entries.find((entry) => entry.name === 'events.jsonl'), worktree),
    }
  } catch {
    return null
  }
}
