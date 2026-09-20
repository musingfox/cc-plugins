import { describe, expect, test } from 'claude-code/testing'
import { CONFIG_PATH, HOME_MANIFEST, PANE, PRESS, ROOT, cardSelect, expectDrawn, issue, mounted, nodesOf, press, renderRuns, runsOf, stringsIn, vizWorld } from './fixtures/pane.ts'
import { AB, CONFIG, manifest, world } from './fixtures/world.ts'

const MOD = 'mod-obw-issue-pane'
// The browser target is the row's path below the project, so a task card carries its folder.
const TEMP = '/tmp/viz/obw/tasks-mod-obw-issue-pane.md'
const PAGE = 'obw-tasks-mod-obw-issue-pane'

describe('finding viz', () => {
  test('HOME alone reads the manifest under ~/.claude after the config', async ($, on) => {
    const w = world(on, { env: { HOME: '/Users/u' } })
    await issue($, MOD)
    expect(w.readCalls).toEqual([CONFIG_PATH, HOME_MANIFEST])
  })

  test('CLAUDE_CONFIG_DIR moves the manifest read', async ($, on) => {
    const w = world(on, { env: { CLAUDE_CONFIG_DIR: '/cfg', HOME: '/Users/u' } })
    await issue($, MOD)
    expect(w.readCalls).toEqual([CONFIG_PATH, '/cfg/plugins/installed_plugins.json'])
  })

  test('an empty CLAUDE_CONFIG_DIR falls back to HOME', async ($, on) => {
    const w = world(on, { env: { CLAUDE_CONFIG_DIR: '', HOME: '/Users/u' } })
    await issue($, MOD)
    expect(w.readCalls).toEqual([CONFIG_PATH, HOME_MANIFEST])
  })

  test('an environment that cannot be read reads no manifest and still draws the card', async ($, on) => {
    const w = world(on)
    await issue($, MOD)
    expect(w.readCalls).toEqual([CONFIG_PATH])
    const tree = await $.ui.render(PANE)
    expectDrawn(tree)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('neither variable set reads no manifest', async ($, on) => {
    const w = world(on, { env: {} })
    await issue($, MOD)
    expect(w.readCalls).toEqual([CONFIG_PATH])
  })

  test('the list alone reads no manifest', async ($, on) => {
    const w = world(on, { env: { HOME: '/Users/u' } })
    await issue($, '')
    expect(w.readCalls).toEqual([CONFIG_PATH])
  })

  test('a card read error reads no manifest', async ($, on) => {
    const w = world(on, { env: { HOME: '/Users/u' }, read: 'Vault not found.' })
    await issue($, 'k')
    expect(w.readCalls).toEqual([CONFIG_PATH])
  })
})

describe('the Open in browser button', () => {
  test('a shown card with viz found carries one Open in browser button', async ($, on) => {
    vizWorld(on)
    await issue($, MOD)
    const buttons = nodesOf(await $.ui.render(PANE), 'Button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].props.key).toBe('open-in-browser')
    expect(buttons[0].props.label).toBe('Open in browser')
  })

  test('the button is drawn before the card body', async ($, on) => {
    vizWorld(on)
    await issue($, MOD)
    const drawn = JSON.stringify(await $.ui.render(PANE))
    expect(drawn.indexOf('"type":"Button"')).toBeGreaterThan(-1)
    expect(drawn.indexOf('"type":"Button"')).toBeLessThan(drawn.indexOf('"type":"Markdown"'))
  })

  test('no manifest draws the card without a button that could be pressed', async ($, on) => {
    world(on, { env: { HOME: '/Users/u' } })
    await issue($, MOD)
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Button').length).toBe(0)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
    await expect($.ui.press(PRESS)).rejects.toThrow()
  })

  test('two viz installs draw no button', async ($, on) => {
    const entry = [{ scope: 'user', installPath: ROOT }]
    const two = JSON.stringify({ version: 2, plugins: { 'viz@a': entry, 'viz@b': entry } })
    vizWorld(on, { files: { [CONFIG_PATH]: CONFIG, [HOME_MANIFEST]: two } })
    await issue($, MOD)
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(0)
  })

  test('a manifest that is not JSON draws no button and no engine fallback', async ($, on) => {
    vizWorld(on, { files: { [CONFIG_PATH]: CONFIG, [HOME_MANIFEST]: 'not json' } })
    await issue($, MOD)
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Button').length).toBe(0)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
    expectDrawn(tree)
  })

  test('an environment that cannot be read draws no button', async ($, on) => {
    world(on)
    await issue($, MOD)
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(0)
  })

  test('the list alone draws no button', async ($, on) => {
    vizWorld(on)
    await issue($, '')
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(0)
  })
})

describe('the button surface', () => {
  test('the desktop draws the card without the button', async ($, on) => {
    vizWorld(on)
    await issue($, MOD)
    const tree = await $.ui.render({ ...PANE, surface: 'desktop' })
    expect(nodesOf(tree, 'Button').length).toBe(0)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('the terminal draws the button', async ($, on) => {
    vizWorld(on)
    await issue($, MOD)
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(1)
  })
})

describe('pressing Open in browser', () => {
  test('the whole card body is written to the temp file', async ($, on) => {
    const w = vizWorld(on)
    await issue($, MOD)
    await press($, w)
    expect(w.writes).toEqual([
      { path: TEMP, text: '# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n' },
    ])
  })

  test('the temp file and page carry the folder the card was read from', async ($, on) => {
    const w = vizWorld(on, { query: '[{"path":"pm/cc-plugins/docs/a.md"}]' })
    await issue($, '')
    const pane = await mounted($)
    await pane.select({ key: 'cards', value: 'pm/cc-plugins/docs/a.md' })
    await w.clock.settle()
    await pane.redraw()
    await pane.press({ key: 'open-in-browser' })
    await w.clock.settle()
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/docs/a.md')
    expect(w.writes[0].path).toBe('/tmp/viz/obw/docs-a.md')
    expect(renderRuns(w)[0].argv[3]).toBe('obw-docs-a')
  })

  test('a long body is written unclipped while the pane draws it clipped', async ($, on) => {
    const w = vizWorld(on, { read: '---\ntitle: t\n---\n' + 'x'.repeat(11000) })
    await issue($, 'k')
    await press($, w)
    expect(w.writes[0].text.length).toBe(11000)
    expect(nodesOf(await $.ui.render(PANE), 'Markdown')[0].props.text.length).toBe(10000)
  })

  test('a card name that is not a plain slug is written as card.md', async ($, on) => {
    const w = vizWorld(on)
    await issue($, 'my card')
    await press($, w)
    expect(w.writes[0].path).toBe('/tmp/viz/obw/card.md')
  })

  test('a refused write is shown and runs nothing', async ($, on) => {
    const w = vizWorld(on, { write: { deny: 'EACCES' } })
    await issue($, MOD)
    expect(await press($, w)).toEqual({ element: 'open-in-browser' })
    expect(renderRuns(w)).toEqual([])
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings.filter((text) => text.startsWith(`Could not write ${TEMP}`)).length).toBe(1)
  })

  test('a shown card without a press writes nothing', async ($, on) => {
    const w = vizWorld(on)
    await issue($, MOD)
    await $.ui.render(PANE)
    expect(w.writes).toEqual([])
  })
})

describe('running viz', () => {
  test('a press runs the installed render.sh on the temp file', async ($, on) => {
    const w = vizWorld(on)
    await issue($, MOD)
    await press($, w)
    expect(renderRuns(w)[0].argv).toEqual([
      'bash',
      '/Users/u/.claude/plugins/cache/m/viz/1.1.4/lib/render.sh',
      TEMP,
      PAGE,
    ])
    expect(renderRuns(w)[0].init).toEqual({ timeoutMs: 15000 })
  })

  test('the install found through CLAUDE_CONFIG_DIR is the one run', async ($, on) => {
    const w = world(on, {
      env: { CLAUDE_CONFIG_DIR: '/cfg', HOME: '/Users/u' },
      files: {
        [CONFIG_PATH]: CONFIG,
        '/cfg/plugins/installed_plugins.json': manifest('/cfg/plugins/cache/m/viz/1.1.4'),
        [HOME_MANIFEST]: manifest('/Users/u/.claude/plugins/cache/m/viz/1.1.3'),
      },
    })
    await issue($, MOD)
    await press($, w)
    expect(renderRuns(w)[0].argv[1]).toBe('/cfg/plugins/cache/m/viz/1.1.4/lib/render.sh')
  })

  test('drawing the pane runs nothing', async ($, on) => {
    const w = vizWorld(on)
    await issue($, MOD)
    for (let i = 0; i < 3; i += 1) await $.ui.render(PANE)
    expect(w.runs.length).toBe(3)
    expect(renderRuns(w)).toEqual([])
  })
})

const OUTCOME = /^(Rendering|Opened|Rendered)/

describe('the press outcome', () => {
  test('before a press no outcome is drawn', async ($, on) => {
    vizWorld(on)
    await issue($, MOD)
    expect(stringsIn(await $.ui.render(PANE)).filter((text) => OUTCOME.test(text))).toEqual([])
  })

  test('a running render shows that it is rendering and keeps the button', async ($, on) => {
    const w = vizWorld(on, { render: 'defer' })
    await issue($, MOD)
    await press($, w)
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain('Rendering in the browser…')
    expect(nodesOf(tree, 'Button').length).toBe(1)
  })

  test('a finished render shows the opened page', async ($, on) => {
    const w = vizWorld(on, { render: 'defer' })
    await issue($, MOD)
    await press($, w)
    w.release(3, '/tmp/viz/work/obw-mod-obw-issue-pane-260919120000.html\n')
    await w.clock.settle()
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings).toContain('Opened in the browser: /tmp/viz/work/obw-mod-obw-issue-pane-260919120000.html')
    expect(strings).not.toContain('Rendering in the browser…')
  })

  test('a render over SSH shows the path and the URL, not an opened page', async ($, on) => {
    const w = vizWorld(on, { render: '/tmp/viz/work/x.html\nURL: http://100.64.0.1:18090/work/x.html\n' })
    await issue($, MOD)
    await press($, w)
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings).toContain('Rendered: /tmp/viz/work/x.html')
    expect(strings).toContain('URL: http://100.64.0.1:18090/work/x.html')
    expect(strings.filter((text) => text.startsWith('Opened in the browser'))).toEqual([])
  })

  test('a failed render shows its error under the card', async ($, on) => {
    const w = vizWorld(on, { render: { exitCode: 1, stderr: `Error: File not found: ${TEMP}\n` } })
    await issue($, MOD)
    await press($, w)
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain(`Error: File not found: ${TEMP}`)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('a render that cannot start is shown and the press still resolves', async ($, on) => {
    const w = vizWorld(on, { render: { deny: 'spawn failed' } })
    await issue($, MOD)
    expect(await press($, w)).toEqual({ element: 'open-in-browser' })
    expect(stringsIn(await $.ui.render(PANE))).toContain(
      'viz did not render: render.sh could not start, or it did not finish within 15 s.',
    )
  })
})

describe('a press result after a newer read', () => {
  test('a render that settles after the same card is read again is dropped', async ($, on) => {
    const w = vizWorld(on, { render: 'defer' })
    await issue($, 'a')
    await press($, w)
    await $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    w.release(3, '/tmp/viz/work/obw-a-1.html\n')
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree).filter((text) => OUTCOME.test(text))).toEqual([])
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('a render that settles after another card is read is dropped', async ($, on) => {
    const w = vizWorld(on, { render: 'defer', query: AB })
    await issue($, 'a')
    await press($, w)
    await $.command.run({ command: 'issue', args: 'b' })
    await w.clock.settle()
    w.release(3, '/tmp/viz/work/obw-a-1.html\n')
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree).filter((text) => OUTCOME.test(text))).toEqual([])
    expect(cardSelect(tree).props.value).toBe('pm/cc-plugins/tasks/b.md')
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })
})

describe('bounded press outcome', () => {
  test('a long path holding a carriage return is drawn clean and clipped', async ($, on) => {
    const w = vizWorld(on, { render: '/tmp/viz/work/' + 'p'.repeat(11000) + '\r.html\n' })
    await issue($, MOD)
    await press($, w)
    const strings = stringsIn(await $.ui.render(PANE))
    for (const text of strings) expect(text).toMatch(/^[^\x00-\x08\x0b-\x1f\x7f-\x9f]*$/)
    expect(strings.find((text) => text.startsWith('Opened in the browser: '))!.length).toBe(10000)
  })

  test('a long error is clipped', async ($, on) => {
    const w = vizWorld(on, { render: { exitCode: 1, stderr: 'e'.repeat(11000) } })
    await issue($, MOD)
    await press($, w)
    expect(stringsIn(await $.ui.render(PANE)).find((text) => text.startsWith('eee'))!.length).toBe(10000)
  })

  test('an error holding control characters is drawn without them', async ($, on) => {
    const w = vizWorld(on, { render: { exitCode: 1, stderr: 'bad\r\x1b[31mred' } })
    await issue($, MOD)
    await press($, w)
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings).toContain('bad[31mred')
    expect(strings.filter((text) => text.includes('\r') || text.includes('\x1b'))).toEqual([])
  })
})
