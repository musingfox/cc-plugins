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

export function renderArgv(vizRoot: string, target: { file: string; name: string }): string[] {
  return ['bash', `${vizRoot}/lib/render.sh`, target.file, target.name]
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

export const SERVE_STATUS_ARGV = ['tailscale', 'serve', 'status', '--json']
export const SERVE_TIMEOUT_MS = 5_000

const LOOPBACK = new Set(['127.0.0.1', 'localhost'])

function httpUrl(text: string): URL | null {
  try {
    const url = new URL(text)
    return url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

export function isLoopbackUrl(text: string): boolean {
  const url = httpUrl(text)
  return url !== null && LOOPBACK.has(url.hostname)
}

// Only a port tailscale serve already proxies over HTTPS counts: reading the status never maps one.
export function tailnetUrl(localUrl: string, statusJson: string): string | null {
  const local = httpUrl(localUrl)
  const status = parsed(statusJson)
  if (!local || !LOOPBACK.has(local.hostname) || !isRecord(status) || !isRecord(status.Web)) return null
  const tcp = isRecord(status.TCP) ? status.TCP : {}
  for (const [hostPort, web] of Object.entries(status.Web)) {
    const root = isRecord(web) && isRecord(web.Handlers) ? web.Handlers['/'] : null
    const proxy = isRecord(root) && typeof root.Proxy === 'string' ? httpUrl(root.Proxy) : null
    if (!proxy || !LOOPBACK.has(proxy.hostname) || proxy.port !== local.port || proxy.pathname !== '/') continue
    const listener = tcp[hostPort.slice(hostPort.lastIndexOf(':') + 1)]
    if (!isRecord(listener) || listener.HTTPS !== true) continue
    try {
      return new URL(`${local.pathname}${local.search}`, `https://${hostPort}`).href
    } catch {
      continue
    }
  }
  return null
}
