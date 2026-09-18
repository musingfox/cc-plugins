import { isBadCardName, taskFolder } from './argv.ts'

export type Run = { kind: 'exited'; exitCode: number; stdout: string; stderr: string } | { kind: 'rejected' }

export const OBSIDIAN_TIMEOUT_MS = 10_000

const NOT_RUN = `The obsidian CLI did not run: it is not on PATH, or it did not answer within ${OBSIDIAN_TIMEOUT_MS / 1000} s.`

// Anything that is not a known success shape is shown as the CLI printed it.
function errorMessage(run: Run) {
  if (run.kind === 'rejected') return NOT_RUN
  return run.stdout.trim() || run.stderr.trim() || `obsidian exited ${run.exitCode} with no output.`
}

function cardPathsOf(text: string): string[] | null {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null
  } catch {
    return null
  }
}

export function searchOutput(
  run: Run,
  project: string,
): { kind: 'cards'; cards: string[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: errorMessage(run) }
  const text = run.stdout.trim()
  if (text === 'No matches found.') return { kind: 'empty' }
  const paths = cardPathsOf(text)
  if (!paths) return { kind: 'error', message: errorMessage(run) }
  const folder = taskFolder(project)
  const names = paths
    .filter((path) => path.startsWith(folder) && path.endsWith('.md'))
    .map((path) => path.slice(folder.length, -'.md'.length))
    .filter((name) => !isBadCardName(name))
  const cards = [...new Set(names)]
  return cards.length ? { kind: 'cards', cards } : { kind: 'empty' }
}

function noteOf(stdout: string): { frontmatter: string; body: string } | null {
  if (!stdout.startsWith('---\n')) return null
  const at = stdout.indexOf('---\n', 4)
  if (at < 0) return null
  return { frontmatter: stdout.slice(4, at === 4 ? at : at - 1), body: stdout.slice(at + 4) }
}

export function readOutput(run: Run): { kind: 'card'; frontmatter: string; body: string } | { kind: 'error'; message: string } {
  const note = run.kind === 'exited' && run.exitCode === 0 ? noteOf(run.stdout) : null
  if (!note) return { kind: 'error', message: errorMessage(run) }
  return { kind: 'card', ...note }
}
