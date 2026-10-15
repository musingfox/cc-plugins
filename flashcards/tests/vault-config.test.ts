import { describe, expect, test } from 'claude-code/testing'
import { resolveVault } from '../hooks/vault-config.ts'
import { fake } from './fixtures/fake.ts'

describe('resolveVault', () => {
  test('the .obsidian.yaml above the session directory names the vault and project', async () => {
    const { $ } = fake({ cwd: '/work/a/b', files: { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n' } })
    expect(await resolveVault($)).toEqual({ kind: 'configured', vault: 'obsidian', project: 'cc-plugins' })
  })

  test('the nearest .obsidian.yaml wins', async () => {
    const { $ } = fake({
      cwd: '/work/a/b',
      files: { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n', '/work/a/.obsidian.yaml': 'vault: other\npm:\n  project: p2\n' },
    })
    expect(await resolveVault($)).toEqual({ kind: 'configured', vault: 'other', project: 'p2' })
  })

  test('a top-level project without pm.project is incomplete', async () => {
    const { $ } = fake({ files: { '/work/.obsidian.yaml': 'vault: obsidian\nproject: cc-plugins\n' } })
    expect(await resolveVault($)).toEqual({ kind: 'incomplete', missing: 'pm.project' })
  })

  test('no config above is none', async () => {
    expect(await resolveVault(fake().$)).toEqual({ kind: 'none' })
  })

  test('a config that cannot be read is none', async () => {
    const { $ } = fake({ files: { '/work/.obsidian.yaml': { deny: 'EACCES' } } })
    expect(await resolveVault($)).toEqual({ kind: 'none' })
  })
})
