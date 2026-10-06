import type { Register } from 'claude-code'
import { COMMAND_2048, register2048 } from './pane-2048.ts'
import { COMMAND_DINO, registerDino } from './pane-dino.ts'
import { COMMAND_GOMOKU, registerGomoku } from './pane-gomoku.ts'
import type { GomokuOptions } from './pane-gomoku.ts'
import { COMMAND_MINES, registerMines } from './pane-mines.ts'

// The engine takes one unmatched session.start per plugin and never follows $ across an
// import, so the games' commands register here.
export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    for (const command of [COMMAND_2048, COMMAND_MINES, COMMAND_DINO, COMMAND_GOMOKU]) {
      try {
        await $.command.register(command)
      } catch {
        // A refused command leaves that one game unreachable; the others still register.
      }
    }
    return next(e)
  })
  register2048(on)
  registerMines(on)
  registerDino(on)
  registerGomoku(on, (options ?? {}) as GomokuOptions)
}
