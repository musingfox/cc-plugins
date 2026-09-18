import { expect, test } from 'claude-code/testing'
import { vizManifestPath } from '../hooks/viz.ts'

test('reads the manifest under an absolute CLAUDE_CONFIG_DIR', () => {
  expect(vizManifestPath('/cfg', '/home/u')).toBe('/cfg/plugins/installed_plugins.json')
})

test('reads the manifest under HOME when CLAUDE_CONFIG_DIR is unset', () => {
  expect(vizManifestPath(undefined, '/home/u')).toBe('/home/u/.claude/plugins/installed_plugins.json')
})

test('reads the manifest under HOME when CLAUDE_CONFIG_DIR is empty', () => {
  expect(vizManifestPath('', '/home/u')).toBe('/home/u/.claude/plugins/installed_plugins.json')
})

test('finds no manifest for a relative CLAUDE_CONFIG_DIR', () => {
  expect(vizManifestPath('cfg', '/home/u')).toBe(null)
})

test('finds no manifest for a relative HOME', () => {
  expect(vizManifestPath(undefined, 'home')).toBe(null)
})

test('finds no manifest for an empty HOME', () => {
  expect(vizManifestPath(undefined, '')).toBe(null)
})

test('finds no manifest when neither is set', () => {
  expect(vizManifestPath(undefined, undefined)).toBe(null)
})
