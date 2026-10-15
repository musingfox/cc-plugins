// The obsidian CLI runs only on literal, scoped arguments: nothing here is shell-parsed, and anything
// that could widen the path or the project is refused before a run.
export type Run = { kind: 'exited'; exitCode: number; stdout: string; stderr: string } | { kind: 'rejected' }

export type Scope = { vault: string; project: string }

export type Row = { path: string; status: string | null; completed: string | null; title: string | null }

export type QueryOutput = { kind: 'rows'; rows: Row[] } | { kind: 'empty' } | { kind: 'error'; message: string }

export const VAULT_TIMEOUT_MS = 10_000

const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/
const BAD_PROJECT = /[/\s[\]"']/
const NOT_RUN = `The obsidian CLI did not run: it is not on PATH, or it did not answer within ${VAULT_TIMEOUT_MS / 1000} s.`

function scopeRefusal(scope: Scope): { refused: 'vault' | 'project' } | null {
  // Copied from obsidian-workspace/hooks/base-argv.ts isBadVault: a vault name with a control character is refused.
  if (!scope.vault || CONTROLS.test(scope.vault)) return { refused: 'vault' }
  if (!scope.project || BAD_PROJECT.test(scope.project) || CONTROLS.test(scope.project)) return { refused: 'project' }
  return null
}

export function queryArgv(scope: Scope): { argv: string[] } | { refused: 'vault' | 'project' } {
  const refused = scopeRefusal(scope)
  if (refused) return refused
  return { argv: ['obsidian', `vault=${scope.vault}`, 'base:query', `path=pm/${scope.project}/dashboard.base`, 'view=All Tasks', 'format=json'] }
}

function isCardPath(project: string, path: string) {
  return (
    path.startsWith(`pm/${project}/`) &&
    path.endsWith('.md') &&
    !CONTROLS.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}

export function readArgv(scope: Scope, path: string): { argv: string[] } | { refused: 'vault' | 'project' | 'path' } {
  const refused = scopeRefusal(scope)
  if (refused) return refused
  if (!isCardPath(scope.project, path)) return { refused: 'path' }
  return { argv: ['obsidian', `vault=${scope.vault}`, 'read', `path=${path}`] }
}

// Anything that is not a known success is shown as the CLI printed it: stdout first on exit 0, where the CLI
// prints its own errors, and stderr first on a non-zero exit.
function errorOf(run: Run): { kind: 'error'; message: string } {
  if (run.kind === 'rejected') return { kind: 'error', message: NOT_RUN }
  const [first, second] = run.exitCode === 0 ? [run.stdout, run.stderr] : [run.stderr, run.stdout]
  return { kind: 'error', message: first.trim() || second.trim() || `obsidian exited ${run.exitCode} with no output.` }
}

const text = (value: unknown) => (typeof value === 'string' ? value : null)

export function queryOutput(run: Run): QueryOutput {
  if (run.kind !== 'exited' || run.exitCode !== 0) return errorOf(run)
  let parsed: unknown
  try {
    parsed = JSON.parse(run.stdout)
  } catch {
    return errorOf(run)
  }
  if (!Array.isArray(parsed) || !parsed.every((row) => row && typeof row === 'object' && typeof row.path === 'string')) return errorOf(run)
  if (!parsed.length) return { kind: 'empty' }
  return {
    kind: 'rows',
    rows: parsed.map((row) => ({ path: row.path, status: text(row.status), completed: text(row.completed), title: text(row.title) })),
  }
}

export function readOutput(run: Run): { kind: 'card'; text: string } | { kind: 'error'; message: string } {
  if (run.kind === 'exited' && run.exitCode === 0 && run.stdout.startsWith('---\n')) return { kind: 'card', text: run.stdout }
  return errorOf(run)
}
