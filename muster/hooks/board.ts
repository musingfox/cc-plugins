import type { BandRow, Board, RunState } from '../types/index.d.ts'
import { classifyRun, elapsedSeconds, figuresOf } from './band-model.ts'

const LIVE: ReadonlySet<RunState> = new Set(['starting', 'running', 'question', 'idle'])
const COLLECT: ReadonlySet<RunState> = new Set(['done', 'blocked', 'malformed'])

const trimSlashes = (path: string): string => path.replace(/\/+$/, '')

const readText = ($: any, path: string): Promise<string | null> =>
  Promise.resolve($.fs.read(path)).then((text: unknown) => (typeof text === 'string' ? text : null), () => null)

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
async function runOf($: any, dir: string, name: string, root: string, now: number): Promise<{ state: RunState; row: BandRow } | null> {
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
    return { state, row: { name, state: state as BandRow['state'], title: figures.title, plan: figures.plan, tools: figures.tools, cost: figures.cost, seconds } }
  } catch {
    return null
  }
}

// The runs of this repository in flight and how many wait to be collected; null when none is in flight. Never throws.
export async function readBoard($: any): Promise<Board | null> {
  try {
    const runsRoot = await runsRootOf($)
    if (runsRoot === null) return null
    const root = trimSlashes(await $.session.root())
    const now = await $.clock.now()
    const entries: { name: string; kind: string }[] = await $.fs.list(runsRoot)
    const runs = await Promise.all(entries.filter((entry) => entry.kind === 'dir').map((entry) => runOf($, `${runsRoot}/${entry.name}`, entry.name, root, now)))
    const rows = runs.flatMap((run) => (run && LIVE.has(run.state) ? [run.row] : []))
    if (rows.length === 0) return null
    return { rows, collect: runs.filter((run) => run !== null && COLLECT.has(run.state)).length }
  } catch {
    return null
  }
}
