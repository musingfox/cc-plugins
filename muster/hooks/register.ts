import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { Activity, BandRow, Board, RunDetail, RunRow, TreeGroup, TreeView } from '../types/index.d.ts'
import { LIVE, boardOf, readDetail, readRuns } from './board.ts'
import { GLYPH, STATE_COLOR, bar, costText, elapsedText, progressCell, summaryParts } from './band-model.ts'
import { arrowTarget, askKey, drawnKeys, groupByIssue, handOffText, isOpenable, issueKey, openKey, runKey } from './tree-model.ts'

export const board = atom({ plugin: 'muster', key: 'board' } as const, null as Board | null)
export const tree = atom({ plugin: 'muster', key: 'tree' } as const, null as TreeGroup[] | null)
export const view = atom({ plugin: 'muster', key: 'view' } as const, { folded: [], selected: null, at: null, detail: null } as TreeView)

export const TREE_PANE = 'muster-tree'
const TREE_TITLE = 'muster'
const TREE_OPEN = { id: TREE_PANE, title: TREE_TITLE, focus: true, closeOnEscape: true } as const

const POLL_MS = 5000

let timer: { cancel(): void } | null = null
let polling = false
// Run names this module has listed; null until the first read, which only seeds it so a start or reload opens nothing.
let seen: Set<string> | null = null

// One read at a time: a tick that fires while a read is pending is skipped, and a read that never settles blocks only its own ticks.
async function poll($: any) {
  if (polling) return
  polling = true
  try {
    const runs = await readRuns($)
    await update($, board, () => boardOf(runs))
    await update($, tree, () => (runs === null ? null : groupByIssue(runs)))
    if (runs !== null) await openOnDispatch($, runs)
    const { selected } = await read($, view)
    if (selected !== null) await loadDetail($, selected)
  } finally {
    polling = false
  }
}

// A run first listed in flight opens the pane unasked and leaves the keyboard at the prompt; the engine seats it only on a wide enough terminal.
async function openOnDispatch($: any, runs: RunRow[]) {
  const fresh = seen === null ? [] : runs.filter((run) => !seen!.has(run.name) && LIVE.has(run.state))
  seen = new Set([...(seen ?? []), ...runs.map((run) => run.name)])
  // A refused open must not cost the tick its tree update.
  if (fresh.length > 0) await $.ui.open({ id: TREE_PANE, title: TREE_TITLE, closeOnEscape: true }).catch(() => {})
}

// A detail read that settles after the person picked another run is dropped inside the compare-and-set.
async function loadDetail($: any, name: string) {
  const found = await readDetail($, name)
  await update($, view, (value) => (value.selected === name ? { ...value, detail: found } : value))
}

async function toggleFold($: any, key: string) {
  await update($, view, (value) => ({ ...value, folded: value.folded.includes(key) ? value.folded.filter((entry) => entry !== key) : [...value.folded, key] }))
}

async function toggleRun($: any, name: string) {
  const { selected } = await update($, view, (value) => ({ ...value, selected: value.selected === name ? null : name, detail: null }))
  if (selected === name) await loadDetail($, name)
}

const clipped = (text: string, width: number): string => (text.length > width ? `${text.slice(0, width - 1)}…` : text)

const quiet = (work: Promise<unknown>) => void work.catch(() => {})

// On Debian-like hosts `open` is openvt, which starts and then fails, so a failed exit falls back too.
async function openIssue($: any, url: string) {
  const ran = (cmd: string) => $.process.run([cmd, url]).then((result: { exitCode: number }) => result.exitCode === 0, () => false)
  if (!(await ran('open')) && !(await ran('xdg-open'))) void $.ui.toast(`muster: could not open ${drawable(url).slice(0, 200)}`)
}

// The pane holds the keys, and a box under a dialog takes no text, so the pane closes first. The line is left unsent:
// the person finishes it and the coordinator acts, never the pane.
async function handOff($: any, run: RunRow) {
  try {
    await $.ui.close({ id: TREE_PANE })
    const { isFilled } = await $.prompt.fill({ text: handOffText({ ...run, name: drawable(run.name), issue: run.issue === null ? null : drawable(run.issue).slice(0, 500) }), mode: 'append' })
    if (isFilled) return
  } catch {
    // A refused close or fill reads the same to the person as a box that would not take the line.
  }
  void $.ui.toast(`muster: the prompt could not take the line about ${drawable(run.name)}`)
}

// A run's name and title come from files, so they are drawn without control characters and capped in length.
const drawable = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 10000)

function rowOf(Box: any, Text: any, row: BandRow) {
  const progress = progressCell(row)
  return Box({
    columnGap: 2,
    children: [
      Box({ width: 14, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [drawable(row.name)] })] }),
      Box({ width: 2, flexShrink: 0, children: [Text({ color: STATE_COLOR[row.state], children: [GLYPH[row.state]] })] }),
      Box({ width: 36, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [drawable(row.title)] })] }),
      Box({ width: 11, flexShrink: 0, children: [Text({ ...(progress.dim ? { dimColor: true } : {}), children: [progress.text] })] }),
      Text({ wrap: 'truncate-end', children: [Text({ dimColor: true, children: [elapsedText(row.seconds)] }), costText(row.cost)] }),
    ],
  })
}

async function drawBand($: any, e: any, beneath: unknown) {
  const current = await read($, board)
  if (!current) return beneath
  const { Box, Text } = await $.ui.resolve(e)
  const header = Text({
    children: [Text({ weight: 'bold', children: ['muster'] }), Text({ dimColor: true, children: [` · ${summaryParts(current.rows, current.collect).join(' · ')}`] })],
  })
  return Box({
    flexDirection: 'column',
    children: [Box({ flexDirection: 'column', children: [header, ...current.rows.map((row) => rowOf(Box, Text, row))] }), beneath],
  })
}

// One run is one branch of its issue: the connector, a coloured state glyph, the name as a Button, then the facts.
function treeRowOf($: any, Box: any, Text: any, Button: any, run: RunRow, last: boolean) {
  const progress = progressCell(run)
  return Box({
    columnGap: 1,
    children: [
      Text({ dimColor: true, children: [last ? '└─' : '├─'] }),
      Text({ color: STATE_COLOR[run.state], children: [GLYPH[run.state]] }),
      Box({ width: 16, flexShrink: 0, children: [Button({ plain: true, key: runKey(run.name), label: drawable(run.name).slice(0, 16), onPress: () => quiet(toggleRun($, run.name)) })] }),
      Box({ flexGrow: 1, flexShrink: 1, children: [Text({ wrap: 'truncate-end', children: [drawable(run.title), ...(run.state === 'exited' && run.exitReason ? [Text({ dimColor: true, children: [` → ${drawable(run.exitReason)}`] })] : [])] })] }),
      Box({ width: 11, flexShrink: 0, justifyContent: 'flex-end', children: [Text({ ...(progress.dim ? { dimColor: true } : {}), children: [progress.text] })] }),
      Box({ width: 5, flexShrink: 0, justifyContent: 'flex-end', children: [Text({ dimColor: true, children: [elapsedText(run.seconds)] })] }),
    ],
  })
}

// The detail hangs under its run as that run's children, so the trunk line keeps running past it unless the run is last.
function detailOf($: any, Box: any, Text: any, Button: any, run: RunRow, found: RunDetail | null, last: boolean) {
  const trunk = last ? '   ' : '│  '
  const leaves: unknown[] = []
  const leaf = (child: unknown) => leaves.push(child)
  const kv = (label: string, text: string, color?: string) => Text({ wrap: 'truncate-end', children: [Text({ dimColor: true, children: [`${label} `] }), Text({ ...(color ? { color } : {}), children: [drawable(text)] })] })
  if (found === null) leaf(Text({ dimColor: true, children: ['…'] }))
  else {
    leaf(kv('¶', found.report === null ? '—' : found.report === '' ? '(empty first line)' : found.report, found.report === 'DONE' ? 'success' : found.report === 'BLOCKED' ? 'error' : undefined))
    if (found.reason !== null) leaf(kv('×', found.reason, 'error'))
    for (const q of found.questions) leaf(kv(`?${q.n}`, q.paths.length ? q.paths.join(', ') : '(no paths)', 'warning'))
    for (const line of activityLines(Text, kv, found.activity)) leaf(line)
  }
  leaf(Button({ plain: true, key: askKey(run.name), label: '› ask coordinator', onPress: () => quiet(handOff($, run)) }))
  return Box({
    flexDirection: 'column',
    children: leaves.map((child, i) => Box({ columnGap: 1, children: [Text({ dimColor: true, children: [`${trunk}${i === leaves.length - 1 ? '└─' : '├─'}`] }), Box({ flexGrow: 1, flexShrink: 1, children: [child] })] })),
  })
}

const PLAN_MARK = { completed: '√', in_progress: '►', pending: '·' } as const

function activityLines(Text: any, line: (label: string, text: string) => unknown, activity: Activity | null) {
  if (activity === null) return [line('ø', 'events log unreadable')]
  const { plan, said, denied } = activity
  if (plan === null && said.length === 0 && denied.length === 0) return [line('·', 'nothing yet')]
  const item = (text: string, dim = false) => Text({ wrap: 'truncate-end', ...(dim ? { dimColor: true } : {}), children: [drawable(text)] })
  return [
    ...(plan === null ? [] : [line('≡', bar(plan.done, plan.total)), ...plan.shown.map((entry) => item(`${PLAN_MARK[entry.status]} ${entry.content}`, entry.status !== 'in_progress'))]),
    ...said.map((entry) => item(`» ${entry}`)),
    ...denied.map((entry) => line('ø', entry)),
  ]
}

// Only the CLI runs host commands. Elsewhere a Link stands in, and a remote surface draws any link but https: as plain text.
function openOf($: any, Button: any, Link: any, issue: string, onTerminal: boolean) {
  if (onTerminal) return [Button({ plain: true, key: openKey(issue), label: '→', dimColor: true, onPress: () => quiet(openIssue($, issue)) })]
  return /^https:\/\//i.test(issue) && issue.length <= 2048 ? [Link({ href: issue, label: '→' })] : []
}

async function drawTree($: any, e: any) {
  const { Box, Text, Button, Link } = await $.ui.resolve(e)
  const onTerminal = e.surface === 'terminal'
  const groups = await read($, tree)
  if (groups === null) return Text({ dimColor: true, children: ['No muster runs could be read yet: the runs directory is missing, unreadable, or still loading.'] })
  if (groups.length === 0) return Text({ dimColor: true, children: ['No muster runs in this repository.'] })
  const { folded, selected, detail: found } = await read($, view)
  // A Button label wraps instead of truncating, and a wrapped header pushes its count and open Button off the row.
  const labelWidth = Math.max(12, (typeof e.props?.bodyColumns === 'number' ? e.props.bodyColumns : 80) - 16)
  const runs = groups.flatMap((group) => group.runs)
  const counts = (['running', 'question', 'idle', 'done', 'blocked'] as const).flatMap((state) => {
    const n = runs.filter((run) => run.state === state).length
    return n ? [Text({ color: STATE_COLOR[state], children: [`${GLYPH[state]} ${n}`] })] : []
  })
  return Box({
    flexDirection: 'column',
    children: [
      Box({ columnGap: 2, marginBottom: 1, children: [Text({ weight: 'bold', children: ['muster'] }), ...counts] }),
      ...groups.flatMap((group, i) => {
        const key = issueKey(group.issue)
        const isOpen = !folded.includes(key)
        const header = Box({
          ...(i > 0 ? { marginTop: 1 } : {}),
          columnGap: 1,
          children: [
            Text({ dimColor: true, children: [isOpen ? '▼' : '►'] }),
            Button({ plain: true, key, label: group.issue === null ? '(no issue)' : clipped(drawable(group.issue), labelWidth), ...(i === 0 ? { autoFocus: true } : {}), onPress: () => quiet(toggleFold($, key)) }),
            Text({ dimColor: true, children: [isOpen ? '' : group.runs.map((run) => GLYPH[run.state]).join('')] }),
            ...(group.issue !== null && isOpenable(group.issue) ? openOf($, Button, Link, group.issue, onTerminal) : []),
          ],
        })
        if (!isOpen) return [header]
        return [
          header,
          ...group.runs.flatMap((run, j) => {
            const last = j === group.runs.length - 1
            return [treeRowOf($, Box, Text, Button, run, last), ...(run.name === selected ? [detailOf($, Box, Text, Button, run, found?.name === run.name ? found : null, last)] : [])]
          }),
        ]
      }),
      Box({ marginTop: 1, children: [Text({ dimColor: true, wrap: 'truncate-end', children: ['↑↓ move · enter fold, detail, open, ask · esc close'] })] }),
    ],
  })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    // A reload re-fires session.start on this instance; a second timer would double the cadence.
    timer?.cancel()
    seen = null
    timer = $.clock.every(POLL_MS, () => {
      void poll($).catch(() => {})
    })
    // Not awaited: a read that never settles must not hold the session's start.
    void poll($).catch(() => {})
    try {
      await $.command.register({ name: 'muster-runs', description: "Show this repository's muster runs grouped by issue" })
    } catch {
      // A refused /muster-runs leaves the band working. /muster itself is refused: the engine reserves it for the plugin's /muster:muster skill.
    }
    return next(e)
  })

  on('command.run', { command: 'muster-runs' }, async ($) => {
    void poll($).catch(() => {})
    await $.ui.open(TREE_OPEN)
    return { text: 'muster runs pane opened.' }
  })

  on('ui.focus', { requestId: TREE_PANE }, async ($, e, next) => {
    const moved = await next(e)
    if (!('deny' in moved && moved.deny)) await update($, view, (value) => ({ ...value, at: e.element ?? null }))
    return moved
  })

  // A pane taller than its window turns the arrows into scrolling; an arrow walks the Buttons instead and the window follows.
  // Arrows are the terminal's, so the walk counts the terminal's open Buttons.
  on('ui.scroll', { requestId: TREE_PANE }, async ($, e, next) => {
    const groups = await read($, tree)
    const { folded, selected, at } = await read($, view)
    const target = groups === null ? null : arrowTarget(e, drawnKeys(groups, folded, selected, true), at)
    if (target === null) return next(e)
    try {
      const moved = await $.ui.focus({ requestId: TREE_PANE, key: target })
      if (moved?.deny) return next(e)
      await $.ui.scroll({ in: TREE_PANE, to: { key: target } })
    } catch {
      return next(e)
    }
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: TREE_PANE }, async ($, e) => {
    try {
      return await drawTree($, e)
    } catch {
      const { Text } = await $.ui.resolve(e)
      return Text({ dimColor: true, children: ['The muster runs pane could not be drawn.'] })
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A survey takes the prompt area, and an unreadable board or a failed draw leaves what the layers beneath drew.
    if (e.props?.hasSurvey) return next(e)
    try {
      if (!(await read($, board))) return next(e)
    } catch {
      return next(e)
    }
    const beneath = await next(e)
    try {
      return await drawBand($, e, beneath)
    } catch {
      return beneath
    }
  })
}
