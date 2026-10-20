import { atom, read } from 'claude-code'
import type { On } from 'claude-code'
import type { BandRow, Board } from '../types/index.d.ts'
import { STATE_COLOR, costText, elapsedText, progressCell, stateLabel, summaryParts } from './band-model.ts'

export const board = atom({ plugin: 'muster', key: 'board' } as const, null as Board | null)

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

export function register(on: On) {
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
