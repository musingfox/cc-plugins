import type { Register } from 'claude-code'
import { registerBuild, resetBuild, startBuild } from './build.ts'
import { openReview, registerReview } from './pane-review.ts'

export const COMMAND = {
  name: 'cards',
  description: 'Open the flashcard review pane, or build the deck in the background with /cards build',
  argumentHint: '[build]',
  immediate: true,
} as const

// The engine takes one unmatched session.start per plugin and never follows $ across an
// import, so the command and the build's session state register here.
export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register(COMMAND)
    } catch {
      // A refused command leaves the deck unreachable from the prompt; the plugin keeps loading.
    }
    resetBuild()
    return next(e)
  })
  on('command.run', { command: 'cards' }, async ($, e) => {
    const args = e.args.trim()
    try {
      if (args === '') await openReview($)
      else if (args === 'build') await startBuild($)
      else await $.ui.toast('usage: /cards [build]')
    } catch {
      // A refused pane or toast leaves nothing to show; the command still answers the prompt with {}.
    }
    return {}
  })
  registerReview(on)
  registerBuild(on)
}
