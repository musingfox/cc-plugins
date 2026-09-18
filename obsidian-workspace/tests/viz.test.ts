import { expect, test } from 'claude-code/testing'
import { vizInstallPath, vizManifestPath } from '../hooks/viz.ts'

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

const manifest = (plugins: unknown) => JSON.stringify({ version: 2, plugins })

test('takes the installPath of the single viz user entry', () => {
  const text = '{"version":2,"plugins":{"viz@m":[{"scope":"user","installPath":"/p/viz/1.1.4","version":"1.1.4"}]}}'
  expect(vizInstallPath(text)).toBe('/p/viz/1.1.4')
})

test('prefers the user entry over an earlier project entry', () => {
  const text = manifest({
    'viz@m': [
      { scope: 'project', installPath: '/p/proj' },
      { scope: 'user', installPath: '/p/user' },
    ],
  })
  expect(vizInstallPath(text)).toBe('/p/user')
})

test('takes the first entry when there is no user entry', () => {
  expect(vizInstallPath(manifest({ 'viz@m': [{ scope: 'project', installPath: '/p/proj' }] }))).toBe('/p/proj')
})

test('finds nothing when two marketplaces each install viz', () => {
  const text = manifest({
    'viz@a': [{ scope: 'user', installPath: '/p/a' }],
    'viz@b': [{ scope: 'user', installPath: '/p/b' }],
  })
  expect(vizInstallPath(text)).toBe(null)
})

test('finds nothing when no key is viz@', () => {
  const text = manifest({
    'omp-quota@m': [{ scope: 'user', installPath: '/p/omp' }],
    'vizzy@m': [{ scope: 'user', installPath: '/p/vizzy' }],
  })
  expect(vizInstallPath(text)).toBe(null)
})

test('finds nothing for an empty viz entry list', () => {
  expect(vizInstallPath(manifest({ 'viz@m': [] }))).toBe(null)
})

test('finds nothing when the viz value is not a list', () => {
  expect(vizInstallPath(manifest({ 'viz@m': { scope: 'user', installPath: '/p' } }))).toBe(null)
})

test('finds nothing for a relative installPath', () => {
  expect(vizInstallPath(manifest({ 'viz@m': [{ scope: 'user', installPath: 'rel/viz' }] }))).toBe(null)
})

test('finds nothing for an empty installPath', () => {
  expect(vizInstallPath(manifest({ 'viz@m': [{ scope: 'user', installPath: '' }] }))).toBe(null)
})

test('finds nothing for an entry without installPath', () => {
  expect(vizInstallPath(manifest({ 'viz@m': [{ scope: 'user' }] }))).toBe(null)
})

test('finds nothing in text that is not JSON', () => {
  expect(vizInstallPath('not json')).toBe(null)
})

test('finds nothing in a JSON null', () => {
  expect(vizInstallPath('null')).toBe(null)
})

test('finds nothing when plugins is a list', () => {
  expect(vizInstallPath('{"plugins":[]}')).toBe(null)
})
