import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { BandRow, Board, RunDetail, RunRow, TreeGroup, TreeView } from '../types/index.d.ts'
import { boardOf, readDetail, readRuns } from './board.ts'
import { STATE_COLOR, costText, elapsedText, progressCell, stateLabel, summaryParts } from './band-model.ts'
import { arrowTarget, drawnKeys, groupByIssue, issueKey, runKey, treeStateLabel } from './tree-model.ts'

export const board = atom({ plugin: 'muster', key: 'board' } as const, null as Board | null)
export const tree = atom({ plugin: 'muster', key: 'tree' } as const, null as TreeGroup[] | null)
export const view = atom({ plugin: 'muster', key: 'view' } as const, { folded: [], selected: null, at: null, detail: null } as TreeView)

export const TREE_PANE = 'muster-tree'
const TREE_TITLE = 'muster'
const TREE_OPEN = { id: TREE_PANE, title: TREE_TITLE, focus: true, closeOnEscape: true } as const

const POLL_MS = 5000

let timer: { cancel(): void } | null = null
let polling = false

// One read at a time: a tick that fires while a read is pending is skipped, and a read that never settles blocks only its own ticks.
async function poll($: any) {
  if (polling) return
  polling = true
  try {
    const runs = await readRuns($)
    await update($, board, () => boardOf(runs))
    await update($, tree, () => (runs === null ? null : groupByIssue(runs)))
    const { selected } = await read($, view)
    if (selected !== null) await loadDetail($, selected)
  } finally {
    polling = false
  }
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

const quiet = (work: Promise<unknown>) => void work.catch(() => {})

// A run's name and title come from files, so they are drawn without control characters and capped in length.
const drawable = (text: string): string => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 10000)

function rowOf(Box: any, Text: any, row: BandRow) {
  const progress = progressCell(row)
  return Box({
    columnGap: 2,
    children: [
      Box({ width: 14, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [drawable(row.name)] })] }),
      Box({ width: 10, flexShrink: 0, children: [Text({ color: STATE_COLOR[row.state], children: [stateLabel(row.state)] })] }),
      Box({ width: 36, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [drawable(row.title)] })] }),
      Box({ width: 10, flexShrink: 0, children: [Text({ ...(progress.dim ? { dimColor: true } : {}), children: [progress.text] })] }),
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

function treeRowOf($: any, Box: any, Text: any, Button: any, run: RunRow) {
  const progress = progressCell(run)
  return Box({
    columnGap: 2,
    paddingLeft: 2,
    children: [
      Box({ width: 14, flexShrink: 0, children: [Button({ plain: true, key: runKey(run.name), label: drawable(run.name).slice(0, 14), onPress: () => quiet(toggleRun($, run.name)) })] }),
      Box({ width: 20, flexShrink: 0, children: [Text({ wrap: 'truncate-end', color: STATE_COLOR[run.state], children: [drawable(treeStateLabel(run))] })] }),
      Box({ width: 36, flexShrink: 1, children: [Text({ wrap: 'truncate-end', children: [drawable(run.title)] })] }),
      Box({ width: 10, flexShrink: 0, children: [Text({ ...(progress.dim ? { dimColor: true } : {}), children: [progress.text] })] }),
      Box({ flexShrink: 0, children: [Text({ dimColor: true, wrap: 'truncate-end', children: [elapsedText(run.seconds)] })] }),
    ],
  })
}

function detailOf(Box: any, Text: any, found: RunDetail | null) {
  const line = (label: string, text: string) => Text({ wrap: 'truncate-end', children: [Text({ dimColor: true, children: [`${label}  `] }), drawable(text)] })
  if (found === null) return Box({ paddingLeft: 6, children: [Text({ dimColor: true, children: ['Reading the run…'] })] })
  const report = found.report === null ? 'none yet' : found.report === '' ? '(empty first line)' : found.report
  return Box({
    flexDirection: 'column',
    paddingLeft: 6,
    children: [
      line('report', report),
      ...(found.reason === null ? [] : [line('reason', found.reason)]),
      ...found.questions.map((question) => line(`question ${question.n}`, question.paths.length ? question.paths.join(', ') : '(no paths)')),
      ...(found.activity === null
        ? [line('recent', 'the events log could not be read')]
        : found.activity.length ? [Text({ dimColor: true, children: ['recent'] }), ...found.activity.map((entry) => Text({ wrap: 'truncate-end', children: [`  ${drawable(entry)}`] }))] : [line('recent', 'no activity recorded')]),
    ],
  })
}

async function drawTree($: any, e: any) {
  const { Box, Text, Button } = await $.ui.resolve(e)
  const groups = await read($, tree)
  if (groups === null) return Text({ dimColor: true, children: ['No muster runs could be read yet: the runs directory is missing, unreadable, or still loading.'] })
  if (groups.length === 0) return Text({ dimColor: true, children: ['No muster runs in this repository.'] })
  const { folded, selected, detail: found } = await read($, view)
  return Box({
    flexDirection: 'column',
    children: [
      ...groups.flatMap((group, i) => {
        const key = issueKey(group.issue)
        const isOpen = !folded.includes(key)
        const header = Box({
          ...(i > 0 ? { marginTop: 1 } : {}),
          columnGap: 1,
          children: [
            Text({ dimColor: true, children: [isOpen ? '▾' : '▸'] }),
            Button({ plain: true, key, label: group.issue === null ? '(no issue)' : drawable(group.issue), ...(i === 0 ? { autoFocus: true } : {}), onPress: () => quiet(toggleFold($, key)) }),
            Text({ dimColor: true, children: [` ${group.runs.length}`] }),
          ],
        })
        if (!isOpen) return [header]
        return [
          header,
          ...group.runs.flatMap((run) => [treeRowOf($, Box, Text, Button, run), ...(run.name === selected ? [detailOf(Box, Text, found?.name === run.name ? found : null)] : [])]),
        ]
      }),
      Box({ marginTop: 1, children: [Text({ dimColor: true, wrap: 'truncate-end', children: ['↑↓ move · enter fold or show detail · esc close'] })] }),
    ],
  })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    // A reload re-fires session.start on this instance; a second timer would double the cadence.
    timer?.cancel()
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
  on('ui.scroll', { requestId: TREE_PANE }, async ($, e, next) => {
    const groups = await read($, tree)
    const { folded, at } = await read($, view)
    const target = groups === null ? null : arrowTarget(e, drawnKeys(groups, folded), at)
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
