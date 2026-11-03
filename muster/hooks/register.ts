import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { BandRow, Board, RunRow, TreeGroup } from '../types/index.d.ts'
import { boardOf, readRuns } from './board.ts'
import { STATE_COLOR, costText, elapsedText, progressCell, stateLabel, summaryParts } from './band-model.ts'
import { groupByIssue, treeStateLabel } from './tree-model.ts'

export const board = atom({ plugin: 'muster', key: 'board' } as const, null as Board | null)
export const tree = atom({ plugin: 'muster', key: 'tree' } as const, null as TreeGroup[] | null)

export const TREE_PANE = 'muster-tree'
const TREE_TITLE = 'muster'

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
  } finally {
    polling = false
  }
}

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

function treeRowOf(Box: any, Text: any, run: RunRow) {
  const progress = progressCell(run)
  return Box({
    columnGap: 2,
    paddingLeft: 2,
    children: [
      Box({ width: 14, flexShrink: 0, children: [Text({ wrap: 'truncate-end', children: [drawable(run.name)] })] }),
      Box({ width: 20, flexShrink: 0, children: [Text({ wrap: 'truncate-end', color: STATE_COLOR[run.state], children: [drawable(treeStateLabel(run))] })] }),
      Box({ width: 36, flexShrink: 1, children: [Text({ wrap: 'truncate-end', children: [drawable(run.title)] })] }),
      Box({ width: 10, flexShrink: 0, children: [Text({ ...(progress.dim ? { dimColor: true } : {}), children: [progress.text] })] }),
      Box({ flexShrink: 0, children: [Text({ dimColor: true, wrap: 'truncate-end', children: [elapsedText(run.seconds)] })] }),
    ],
  })
}

async function drawTree($: any, e: any) {
  const { Box, Text } = await $.ui.resolve(e)
  const groups = await read($, tree)
  if (groups === null) return Text({ dimColor: true, children: ['No muster runs could be read yet: the runs directory is missing, unreadable, or still loading.'] })
  if (groups.length === 0) return Text({ dimColor: true, children: ['No muster runs in this repository.'] })
  return Box({
    flexDirection: 'column',
    children: groups.flatMap((group, i) => [
      Box({
        ...(i > 0 ? { marginTop: 1 } : {}),
        columnGap: 2,
        children: [
          Text({ weight: 'bold', wrap: 'truncate-end', children: [group.issue === null ? '(no issue)' : drawable(group.issue)] }),
          Text({ dimColor: true, children: [String(group.runs.length)] }),
        ],
      }),
      ...group.runs.map((run) => treeRowOf(Box, Text, run)),
    ]),
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
    await $.ui.open({ id: TREE_PANE, title: TREE_TITLE })
    return { text: 'muster runs pane opened.' }
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
