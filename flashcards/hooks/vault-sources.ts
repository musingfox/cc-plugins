import type { EngineInterface } from 'claude-code'
import { hashText, reviewableText } from './hash.ts'
import type { Detection, Source } from '../types'
import { resolveVault } from './vault-config.ts'
import { queryArgv, queryOutput, readArgv, readOutput, VAULT_TIMEOUT_MS } from './vault.ts'
import type { Row, Run } from './vault.ts'

async function runCli($: EngineInterface, argv: string[]): Promise<Run> {
  try {
    const result = await $.process.run(argv, { timeoutMs: VAULT_TIMEOUT_MS })
    return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
  } catch {
    return { kind: 'rejected' }
  }
}

// Newest completion first; a card with no completion date goes last; then by path.
function byCompletion(a: Row, b: Row): number {
  if (a.completed !== b.completed) {
    if (a.completed === null) return 1
    if (b.completed === null) return -1
    return a.completed < b.completed ? 1 : -1
  }
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

export async function vaultSources($: EngineInterface): Promise<Detection> {
  const config = await resolveVault($)
  if (config.kind !== 'configured') return { sources: [], unreadable: [], status: 'unconfigured' }
  const scope = { vault: config.vault, project: config.project }
  const query = queryArgv(scope)
  if ('refused' in query) return { sources: [], unreadable: [], status: 'error', message: `vault or project name refused: ${query.refused}` }
  const listed = queryOutput(await runCli($, query.argv))
  if (listed.kind === 'error') return { sources: [], unreadable: [], status: 'error', message: listed.message }
  const rows = listed.kind === 'rows' ? listed.rows.filter((row) => row.status === 'done').sort(byCompletion) : []
  const sources: Source[] = []
  const unreadable: string[] = []
  for (const row of rows) {
    const read = readArgv(scope, row.path)
    if ('refused' in read) {
      unreadable.push(row.path)
      continue
    }
    const card = readOutput(await runCli($, read.argv))
    if (card.kind === 'error') {
      unreadable.push(row.path)
      continue
    }
    const text = reviewableText('task', card.text)
    sources.push({ path: row.path, type: 'task', text, hash: await hashText(text), completed: row.completed })
  }
  return { sources, unreadable, status: 'ok' }
}
