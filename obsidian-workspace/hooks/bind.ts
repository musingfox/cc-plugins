import { taskFolder, isBadCardName } from './argv.ts'
import { isBadCardPath, type Scope } from './base-argv.ts'

export type StatusChange = {
  value: 'in-progress' | 'done'
  vault: string | null
  target: { path: string } | { file: string }
}
export type Binding = { cardPath: string; vault: string; project: string }

export const sameBinding = (a: { cardPath: string; vault: string }, b: { cardPath: string; vault: string }) =>
  a.cardPath === b.cardPath && a.vault === b.vault

const SEPARATORS = [';', '&&', '||', '|', '\n']

function segmentsOf(command: string): string[][] {
  const segments: string[][] = []
  let words: string[] = []
  let word: string | null = null
  let quote = ''
  const endWord = () => { if (word !== null) words.push(word); word = null }
  const endSegment = () => { endWord(); if (words.length) segments.push(words); words = [] }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    if (quote) {
      if (c === quote) quote = ''
      else word += c
      continue
    }
    if (c === '"' || c === "'") { quote = c; word ??= ''; continue }
    const sep = SEPARATORS.find(s => command.startsWith(s, i))
    if (sep) { endSegment(); i += sep.length - 1; continue }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); continue }
    word = (word ?? '') + c
  }
  endSegment()
  return segments
}

function expand(word: string, vars: Map<string, string>) {
  return word.replace(/\$\{([A-Za-z_]\w*)\}|\$([A-Za-z_]\w*)/g, (whole, a, b) => vars.get(a ?? b) ?? whole)
}

export function statusChanges(command: string, output: string): StatusChange[] {
  try {
    const confirmed = new Set(output.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l === 'Set status: in-progress' || l === 'Set status: done'))
    const vars = new Map<string, string>()
    const pending = new Map<string, string>()
    const changes: StatusChange[] = []
    for (const raw of segmentsOf(command)) {
      let at = 0
      while (at < raw.length) {
        const assign = /^([A-Za-z_]\w*)=(.*)$/s.exec(raw[at]!)
        if (!assign) break
        pending.set(assign[1]!, expand(assign[2]!, new Map([...vars, ...pending])))
        at++
      }
      if (at === raw.length) { for (const [k, v] of pending) vars.set(k, v); pending.clear(); continue }
      pending.clear()
      const words = raw.map(w => expand(w, vars))
      const cli = words.indexOf('obsidian', at)
      if (cli < 0) continue
      const rest = words.slice(cli + 1)
      if (!rest.includes('property:set') || !rest.includes('name=status')) continue
      const value = rest.includes('value=in-progress') ? 'in-progress' : rest.includes('value=done') ? 'done' : null
      if (!value || !confirmed.has(`Set status: ${value}`)) continue
      const arg = (key: string) => rest.find(w => w.startsWith(`${key}=`))?.slice(key.length + 1)
      const path = arg('path')
      const file = arg('file')
      const vault = arg('vault')
      const target = path ? { path } : file ? { file } : null
      if (!target || [path, file, vault].some(v => v?.includes('$') || v?.includes('`'))) continue
      changes.push({ value, vault: vault || null, target })
    }
    return changes
  } catch {
    return []
  }
}

function resolve(change: StatusChange, config: Scope | null): Binding | null {
  const vault = change.vault ?? config?.vault
  if (!vault) return null
  if ('path' in change.target) {
    const path = change.target.path
    const project = /^pm\/([^/]+)\/tasks\/.+\.md$/.exec(path)?.[1]
    if (!project || isBadCardPath(project, path)) return null
    return { cardPath: path, vault, project }
  }
  const file = change.target.file
  if (!config || isBadCardName(file)) return null
  const cardPath = `${taskFolder(config.project)}${file}.md`
  if (isBadCardPath(config.project, cardPath)) return null
  return { cardPath, vault, project: config.project }
}

export function bindingAction(
  changes: StatusChange[],
  config: Scope | null,
  bound: { cardPath: string; vault: string } | null,
): { kind: 'bind'; card: Binding } | { kind: 'unbind' } | null {
  try {
    const resolved = changes.flatMap(c => { const card = resolve(c, config); return card ? [{ value: c.value, card }] : [] })
    const bind = resolved.filter(r => r.value === 'in-progress').at(-1)
    if (bind) return { kind: 'bind', card: bind.card }
    if (bound && resolved.some(r => r.value === 'done' && sameBinding(r.card, bound))) return { kind: 'unbind' }
    return null
  } catch {
    return null
  }
}

export function bindingOf(text: string): { cardPath: string; vault: string; project: string | null } | null {
  try {
    const r = JSON.parse(text)
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null
    const { cardPath, vault, project } = r
    if (typeof cardPath !== 'string' || !cardPath || typeof vault !== 'string' || !vault) return null
    const fromPath = /^pm\/([^/]+)\//.exec(cardPath)?.[1] ?? null
    return { cardPath, vault, project: typeof project === 'string' && project ? project : fromPath }
  } catch {
    return null
  }
}

export function bindingPath(launchesDir: string | undefined, home: string | undefined, sessionId: string): string | null {
  if (launchesDir) return launchesDir.startsWith('/') ? `${launchesDir}/${sessionId}.json` : null
  if (home?.startsWith('/')) return `${home}/.claude-mobile/launches/${sessionId}.json`
  return null
}
