import { expect, test } from 'claude-code/testing'
import { listArgv, cardArgv } from '../hooks/argv.ts'
test('builds safe argv', () => { expect(listArgv('obsidian', 'cc-plugins')).toEqual({ argv: ['obsidian','vault=obsidian','search','query=[type:task] [project:cc-plugins] -[status:done]','path=pm/cc-plugins','format=json'] }); expect(cardArgv('obsidian','p','a/b')).toEqual({ refused: 'card' }) })
