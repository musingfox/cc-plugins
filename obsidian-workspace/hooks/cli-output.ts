import { valueOf } from './config.ts'

export type Run = { kind: 'exited'; exitCode: number; stdout: string; stderr: string } | { kind: 'rejected' }

export const OBSIDIAN_TIMEOUT_MS = 10_000

const NOT_RUN = `The obsidian CLI did not run: it is not on PATH, or it did not answer within ${OBSIDIAN_TIMEOUT_MS / 1000} s.`

// Anything that is not a known success shape is shown as the CLI printed it.
// The CLI prints its own errors on stdout with exit 0, so stdout is read first there;
// a non-zero exit is the shell's failure and its complaint is on stderr.
function errorMessage(run: Run) {
  if (run.kind === 'rejected') return NOT_RUN
  const [first, second] = run.exitCode === 0 ? [run.stdout, run.stderr] : [run.stderr, run.stdout]
  return first.trim() || second.trim() || `obsidian exited ${run.exitCode} with no output.`
}

type BaseRow = { path: string; status: string | null; priority: string | null; title: string | null; due: string | null; tags: string | null }

const text = (value: unknown) => (typeof value === 'string' ? value : null)

function tagsOf(value: unknown) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return null
  return value.filter((tag) => typeof tag === 'string').join(', ') || null
}

export function baseQueryOutput(run: Run): { kind: 'rows'; rows: BaseRow[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: errorMessage(run) }
  try {
    const parsed = JSON.parse(run.stdout)
    if (!Array.isArray(parsed) || !parsed.every((row) => row && typeof row === 'object' && typeof row.path === 'string')) {
      return { kind: 'error', message: errorMessage(run) }
    }
    const rows = parsed.map((row) => ({ path: row.path, status: text(row.status), priority: text(row.priority), title: text(row.title), due: text(row.due), tags: tagsOf(row.tags) }))
    return rows.length ? { kind: 'rows', rows } : { kind: 'empty' }
  } catch {
    return { kind: 'error', message: errorMessage(run) }
  }
}

const DRAWABLE = /^[^\x00-\x08\x0b-\x1f\x7f-\x9f\t\n\r]{1,10000}$/

// A listing is the dashboard file's top-level views: list; any other stdout is the CLI
// saying something else, which is shown rather than read as "this dashboard has no view".
// Items whose names the pane could not draw are dropped; if every item is undrawable the
// listing is an error. Only a views: block with no item is empty.
function viewsFrom(stdout: string): { kind: 'views'; views: string[] } | { kind: 'empty' } | null {
  let inViews = false
  let sawViews = false
  let itemIndent: number | null = null
  let keyCol: number | null = null
  let started = false
  let current: string | undefined
  const names: (string | undefined)[] = []

  const finish = () => {
    if (started) names.push(current)
    current = undefined
    started = false
  }

  for (const raw of stdout.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (/^\s*(#|$)/.test(line)) continue

    if (/^\S/.test(line) && !line.startsWith('- ')) {
      if (inViews) finish()
      inViews = false
      if (/^views:/.test(line)) {
        const rest = line.slice('views:'.length).trim()
        if (rest !== '' && rest !== '[]' && !rest.startsWith('#')) return null
        sawViews = true
        inViews = true
        itemIndent = null
        keyCol = null
      }
      continue
    }

    if (!inViews) continue

    const item = /^(\s*)-(\s+)(.*)$/.exec(line)
    if (item) {
      const indent = item[1].length
      if (itemIndent === null) itemIndent = indent
      if (indent === itemIndent) {
        finish()
        started = true
        keyCol = indent + 1 + item[2].length
        if (item[3].startsWith('name:')) current = valueOf(item[3].slice('name:'.length))
        continue
      }
    }

    if (keyCol !== null && started && line.slice(0, keyCol).trim() === '' && line.slice(keyCol).startsWith('name:') && current === undefined) {
      current = valueOf(line.slice(keyCol + 'name:'.length))
    }
  }
  finish()
  if (!sawViews) return null
  const views = names.flatMap((name) => (name && DRAWABLE.test(name) ? [name] : []))
  if (views.length) return { kind: 'views', views }
  return names.length ? null : { kind: 'empty' }
}

export function viewsOutput(run: Run): { kind: 'views'; views: string[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: errorMessage(run) }
  return viewsFrom(run.stdout) ?? { kind: 'error', message: errorMessage(run) }
}

function noteOf(stdout: string): { frontmatter: string; body: string } | null {
  if (!stdout.startsWith('---\n')) return null
  const lines = stdout.split('\n')
  const close = lines.indexOf('---', 1)
  if (close < 0) return null
  return { frontmatter: lines.slice(1, close).join('\n'), body: lines.slice(close + 1).join('\n') }
}

export function readOutput(run: Run): { kind: 'card'; frontmatter: string; body: string } | { kind: 'error'; message: string } {
  const note = run.kind === 'exited' && run.exitCode === 0 ? noteOf(run.stdout) : null
  if (!note) return { kind: 'error', message: errorMessage(run) }
  return { kind: 'card', ...note }
}
