import { expect, test } from 'claude-code/testing'
import { runsRootOf } from '../board.ts'
import { fakeEngine } from './fixtures/world.ts'

test('RunsRootResolution T1 MUSTER_HOME wins over HOME', async () => {
  const { $ } = fakeEngine({ env: { MUSTER_HOME: '/data/m', HOME: '/home/u' } })
  expect(await runsRootOf($)).toBe('/data/m/runs')
})

test('RunsRootResolution T2 without MUSTER_HOME the runs live in the HOME cache', async () => {
  const { $ } = fakeEngine({ env: { HOME: '/home/u' } })
  expect(await runsRootOf($)).toBe('/home/u/.cache/muster/runs')
})

test('RunsRootResolution T3 an empty MUSTER_HOME counts as unset', async () => {
  const { $ } = fakeEngine({ env: { MUSTER_HOME: '', HOME: '/home/u' } })
  expect(await runsRootOf($)).toBe('/home/u/.cache/muster/runs')
})

test('RunsRootResolution T4 with neither variable set there is no runs root', async () => {
  const { $ } = fakeEngine({ env: {} })
  expect(await runsRootOf($)).toBeNull()
})

test('RunsRootResolution T5 an env read that rejects gives no runs root', async () => {
  const { $ } = fakeEngine({ env: { MUSTER_HOME: 'deny', HOME: '/home/u' } })
  expect(await runsRootOf($)).toBeNull()
})
