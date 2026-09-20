import { expect, test } from 'claude-code/testing'
import { world } from './fixtures/world.ts'
test('rejects stale and misspelled world options', async ($, on) => { expect(() => world(on, { search: '[]' } as any)).toThrow('search'); expect(() => world(on, { qeury: '[]' } as any)).toThrow('qeury') })
test('accepts query and empty world options', async ($, on) => { expect(() => world(on, { query: '[]' })).not.toThrow(); expect(() => world(on, {})).not.toThrow() })
