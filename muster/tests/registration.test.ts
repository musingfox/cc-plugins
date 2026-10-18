import { expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..', '..')
const MUSTER = join(ROOT, 'muster')

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'))
}

test('T1: plugin.json parses with name muster and a semver version', () => {
  const manifest = readJson(join(MUSTER, '.claude-plugin', 'plugin.json'))
  expect(manifest.name).toBe('muster')
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(manifest.name.startsWith('claude')).toBe(false)
  expect(manifest.name.startsWith('anthropic')).toBe(false)
})

test('T2: marketplace has exactly one muster entry at ./muster with an [Experimental] description and unique names', () => {
  const marketplace = readJson(join(ROOT, '.claude-plugin', 'marketplace.json'))
  const names: string[] = marketplace.plugins.map((p: { name: string }) => p.name)
  expect(new Set(names).size).toBe(names.length)
  const entries = marketplace.plugins.filter((p: { name: string }) => p.name === 'muster')
  expect(entries.length).toBe(1)
  expect(entries[0].source).toBe('./muster')
  expect(entries[0].description.startsWith('[Experimental]')).toBe(true)
})

test('T3: README has the muster (Experimental) heading and the install command', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  expect(readme).toContain('### muster (Experimental)')
  expect(readme).toContain('/plugin install muster')
})

test('T4: marketplace source directory contains .claude-plugin/plugin.json', () => {
  expect(existsSync(MUSTER)).toBe(true)
  expect(existsSync(join(MUSTER, '.claude-plugin', 'plugin.json'))).toBe(true)
})

function structureBlock(readme: string): string {
  const start = readme.indexOf('### Structure')
  if (start < 0) return ''
  const open = readme.indexOf('```', start)
  const close = readme.indexOf('```', open + 3)
  return open < 0 || close < 0 ? '' : readme.slice(open + 3, close)
}

function treeHasMusterBetween(block: string): boolean {
  const lines = block.split('\n')
  const at = lines.findIndex((l) => l.startsWith('├── muster/'))
  const mermaid = lines.findIndex((l) => l.startsWith('├── mermaid-inline/'))
  const obsidian = lines.findIndex((l) => l.startsWith('├── obsidian-workspace/'))
  return at >= 0 && mermaid >= 0 && obsidian >= 0 && mermaid < at && at < obsidian
}

function musterSection(readme: string): string {
  const start = readme.indexOf('### muster (Experimental)')
  if (start < 0) return ''
  const next = readme.indexOf('\n### ', start + 1)
  return readme.slice(start, next < 0 ? undefined : next)
}

test('T5: README structure tree lists muster/ between mermaid-inline/ and obsidian-workspace/', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  expect(treeHasMusterBetween(structureBlock(readme))).toBe(true)
  const fixture = structureBlock(readme).split('\n').filter((l) => !l.startsWith('├── muster/')).join('\n')
  expect(treeHasMusterBetween(fixture)).toBe(false)
})

test('T6: muster README section states the QUESTION/ANSWER block, the sandbox and the allowlist', () => {
  const section = musterSection(readFileSync(join(ROOT, 'README.md'), 'utf8'))
  expect(section).toContain('QUESTION')
  expect(section).toContain('ANSWER')
  expect(section).toContain('blocks')
  expect(/does not block/i.test(section)).toBe(false)
  expect(section).toContain('sandbox')
  expect(section).toContain('MUSTER_ALLOW_HOSTS')
})
