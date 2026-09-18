import type { On } from 'claude-code'

export function register(on: On) {
  on('session.start', async ($, e, next) => next(e))
}
