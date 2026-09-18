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
