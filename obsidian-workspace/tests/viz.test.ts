import { expect, test } from 'claude-code/testing'
import { isLoopbackUrl, renderArgv, renderOutcome, renderTarget, tailnetUrl, vizInstallPath, vizManifestPath } from '../hooks/viz.ts'

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

test('names the file and page after a kebab card', () => {
  expect(renderTarget('mod-obw-issue-pane')).toEqual({
    file: '/tmp/viz/obw/mod-obw-issue-pane.md',
    name: 'obw-mod-obw-issue-pane',
  })
})

test('keeps dots and underscores in the card name', () => {
  expect(renderTarget('v1.2_x')).toEqual({ file: '/tmp/viz/obw/v1.2_x.md', name: 'obw-v1.2_x' })
})

test('falls back to card for a name with markup', () => {
  expect(renderTarget('a<b')).toEqual({ file: '/tmp/viz/obw/card.md', name: 'obw-card' })
})

test('falls back to card for a name with a space', () => {
  expect(renderTarget('my card')).toEqual({ file: '/tmp/viz/obw/card.md', name: 'obw-card' })
})

test('falls back to card for a non-ASCII name', () => {
  expect(renderTarget('面板')).toEqual({ file: '/tmp/viz/obw/card.md', name: 'obw-card' })
})

test('cuts a long name to its first 64 characters', () => {
  expect(renderTarget('x'.repeat(300))).toEqual({
    file: '/tmp/viz/obw/' + 'x'.repeat(64) + '.md',
    name: 'obw-' + 'x'.repeat(64),
  })
})

test('runs render.sh from the viz root on the target file and page name', () => {
  expect(renderArgv('/p/viz/1.1.4', { file: '/tmp/viz/obw/a.md', name: 'obw-a' })).toEqual([
    'bash',
    '/p/viz/1.1.4/lib/render.sh',
    '/tmp/viz/obw/a.md',
    'obw-a',
  ])
})

const exited = (exitCode: number, stdout: string, stderr = '') => ({ kind: 'exited' as const, exitCode, stdout, stderr })

test('reads an opened path from a single path line', () => {
  expect(renderOutcome(exited(0, '/tmp/viz/work/obw-a-260919120000.html\n'))).toEqual({
    kind: 'opened',
    path: '/tmp/viz/work/obw-a-260919120000.html',
    url: null,
  })
})

test('reads the SSH URL after the path line', () => {
  expect(renderOutcome(exited(0, '/tmp/viz/work/obw-a.html\nURL: http://100.64.0.1:18090/work/obw-a.html\n'))).toEqual({
    kind: 'opened',
    path: '/tmp/viz/work/obw-a.html',
    url: 'http://100.64.0.1:18090/work/obw-a.html',
  })
})

test('shows stderr when render.sh fails', () => {
  expect(renderOutcome(exited(1, '', 'Error: File not found: /tmp/viz/obw/a.md\n'))).toEqual({
    kind: 'error',
    message: 'Error: File not found: /tmp/viz/obw/a.md',
  })
})

test('names the exit code when a failure prints nothing', () => {
  expect(renderOutcome(exited(127, '', ''))).toEqual({
    kind: 'error',
    message: 'viz render.sh exited 127 with no output.',
  })
})

test('reports a success that prints no path', () => {
  expect(renderOutcome(exited(0, ''))).toEqual({ kind: 'error', message: 'viz render.sh printed no output path.' })
})

test('shows a success that prints something other than a path as printed', () => {
  expect(renderOutcome(exited(0, 'garbage\n'))).toEqual({ kind: 'error', message: 'garbage' })
})

test('reports a render.sh that did not start or finish', () => {
  expect(renderOutcome({ kind: 'rejected' })).toEqual({
    kind: 'error',
    message: 'viz did not render: render.sh could not start, or it did not finish within 15 s.',
  })
})

const HOST = 'mac.tail0.ts.net'
const serveStatus = (web: Record<string, string>, https: Record<string, boolean> = {}) =>
  JSON.stringify({
    TCP: Object.fromEntries(Object.keys(web).map((hostPort) => {
      const port = hostPort.split(':')[1]
      return [port, { HTTPS: https[port] ?? true }]
    })),
    Web: Object.fromEntries(Object.entries(web).map(([hostPort, proxy]) => [hostPort, { Handlers: { '/': { Proxy: proxy } } }])),
  })
const LOCAL = 'http://127.0.0.1:18090/work/obw-a.html'

test('a loopback URL whose port tailscale serve proxies over HTTPS reads as the tailnet URL', () => {
  expect(tailnetUrl(LOCAL, serveStatus({ [`${HOST}:443`]: 'http://127.0.0.1:7701', [`${HOST}:18090`]: 'http://127.0.0.1:18090' }))).toBe(
    `https://${HOST}:18090/work/obw-a.html`,
  )
})

test('a port served on 443 needs no port in the tailnet URL, and localhost counts as loopback', () => {
  expect(tailnetUrl('http://localhost:7701/a?b=1', serveStatus({ [`${HOST}:443`]: 'http://localhost:7701' }))).toBe(`https://${HOST}/a?b=1`)
})

test('an unmapped port, a plain-HTTP mapping or a proxy with a path gives no tailnet URL', () => {
  expect(tailnetUrl(LOCAL, serveStatus({ [`${HOST}:8443`]: 'http://127.0.0.1:5173' }))).toBeNull()
  expect(tailnetUrl(LOCAL, serveStatus({ [`${HOST}:18090`]: 'http://127.0.0.1:18090' }, { '18090': false }))).toBeNull()
  expect(tailnetUrl(LOCAL, serveStatus({ [`${HOST}:18090`]: 'http://127.0.0.1:18090/sub' }))).toBeNull()
})

test('a non-loopback URL or unreadable status gives no tailnet URL', () => {
  expect(tailnetUrl('http://100.64.0.1:18090/work/obw-a.html', serveStatus({ [`${HOST}:18090`]: 'http://127.0.0.1:18090' }))).toBeNull()
  expect(tailnetUrl(LOCAL, 'not json')).toBeNull()
  expect(tailnetUrl(LOCAL, '{}')).toBeNull()
})

test('only a local http URL counts as loopback', () => {
  expect([LOCAL, 'http://localhost:1/', 'http://100.64.0.1:18090/', 'nope'].map(isLoopbackUrl)).toEqual([true, true, false, false])
})
