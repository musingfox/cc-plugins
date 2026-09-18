import { expect, test } from 'claude-code/testing'
import { searchOutput, readOutput } from '../hooks/cli-output.ts'
test('classifies cli output positively', () => { expect(searchOutput({kind:'exited',exitCode:0,stdout:'["pm/p/tasks/a.md"]',stderr:''}, 'p')).toEqual({kind:'cards',cards:['a']}); expect(readOutput({kind:'exited',exitCode:0,stdout:'---\n---\nbody',stderr:''})).toEqual({kind:'card',frontmatter:'',body:'body'}) })
