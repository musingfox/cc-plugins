import type { Run } from './cli-output.ts'

export const RENDER_TIMEOUT_MS = 15_000

// A relative directory has no defined base for $.fs, so it gives no manifest rather than a guessed one.
export function vizManifestPath(configDir: string | undefined, home: string | undefined): string | null {
  if (configDir) return configDir.startsWith('/') ? `${configDir}/plugins/installed_plugins.json` : null
  if (home?.startsWith('/')) return `${home}/.claude/plugins/installed_plugins.json`
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Two viz installs from different marketplaces give null rather than an arbitrary pick.
export function vizInstallPath(text: string): string | null {
  const manifest = parsed(text)
  if (!isRecord(manifest) || !isRecord(manifest.plugins)) return null
  const plugins = manifest.plugins
  const keys = Object.keys(plugins).filter((key) => key.startsWith('viz@'))
  if (keys.length !== 1) return null
  const entries = plugins[keys[0]]
  if (!Array.isArray(entries) || entries.length === 0) return null
  const entry = entries.find((item) => isRecord(item) && item.scope === 'user') ?? entries[0]
  if (!isRecord(entry)) return null
  const { installPath } = entry
  return typeof installPath === 'string' && installPath.startsWith('/') ? installPath : null
}

// The name lands unescaped in viz's HTML <title> and in a file name, so only a plain, capped slug passes.
const SLUG = /^[A-Za-z0-9._-]+$/

export function renderTarget(card: string): { file: string; name: string } {
  const slug = SLUG.test(card) ? card.slice(0, 64) : 'card'
  return { file: `/tmp/viz/obw/${slug}.md`, name: `obw-${slug}` }
}

const NOT_RUN = `viz did not render: render.sh could not start, or it did not finish within ${RENDER_TIMEOUT_MS / 1000} s.`

// Only a first line that is an absolute path counts as success; anything else is shown as printed.
export function renderOutcome(
  run: Run,
): { kind: 'opened'; path: string; url: string | null } | { kind: 'error'; message: string } {
  if (run.kind === 'rejected') return { kind: 'error', message: NOT_RUN }
  if (run.exitCode !== 0) {
    const message = run.stderr.trim() || run.stdout.trim() || `viz render.sh exited ${run.exitCode} with no output.`
    return { kind: 'error', message }
  }
  const [first, ...rest] = run.stdout.split('\n')
  const path = first.trim()
  if (!path.startsWith('/')) return { kind: 'error', message: run.stdout.trim() || 'viz render.sh printed no output path.' }
  const urlLine = rest.find((line) => line.startsWith('URL: '))
  return { kind: 'opened', path, url: urlLine ? urlLine.slice('URL: '.length).trim() : null }
}
