import { expect, test } from 'claude-code/testing'
import { configOf } from '../hooks/config.ts'
test('reads obw config', () => expect(configOf('vault: v\npm:\n  project: p\n')).toEqual({ vault: 'v', project: 'p' }))
