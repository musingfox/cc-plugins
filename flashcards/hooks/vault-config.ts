import type { EngineInterface } from 'claude-code'
import { configOf } from './config.ts'

export type VaultConfig = { kind: 'configured'; vault: string; project: string } | { kind: 'none' } | { kind: 'incomplete'; missing: 'vault' | 'pm.project' }

function parentOf(dir: string) {
  const cut = dir.lastIndexOf('/')
  return cut <= 0 ? '/' : dir.slice(0, cut)
}

// The nearest .obsidian.yaml above the session directory decides; a file that cannot be read counts as none.
export async function resolveVault($: EngineInterface): Promise<VaultConfig> {
  try {
    const cwd = await $.session.cwd()
    for (let dir = cwd; ; dir = parentOf(dir)) {
      const path = dir === '/' ? '/.obsidian.yaml' : `${dir}/.obsidian.yaml`
      if (await $.fs.exists(path)) {
        const config = configOf(await $.fs.read(path))
        if (!config.vault) return { kind: 'incomplete', missing: 'vault' }
        if (!config.project) return { kind: 'incomplete', missing: 'pm.project' }
        return { kind: 'configured', vault: config.vault, project: config.project }
      }
      if (dir === '/') return { kind: 'none' }
    }
  } catch {
    return { kind: 'none' }
  }
}
