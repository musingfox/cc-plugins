import { bindings, defineConfig, exports } from 'cf/config'

import * as entrypoint from './src/index.ts' with { type: 'cf-worker' }

export default defineConfig({
  worker: {
    name: 'games-relay',
    entrypoint,
    compatibilityDate: '2026-10-01',
    domains: ['games-relay.musingfox.com'],
    env: {
      ROOMS: bindings.durableObject({ worker: 'games-relay', exportName: 'Room' }),
      LOBBY: bindings.durableObject({ worker: 'games-relay', exportName: 'Lobby' }),
    },
    // The Free plan runs Durable Objects only on the SQLite backend.
    exports: {
      Room: exports.durableObject({ storage: 'sqlite' }),
      Lobby: exports.durableObject({ storage: 'sqlite' }),
    },
  },
})
