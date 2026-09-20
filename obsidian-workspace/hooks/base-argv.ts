import { isBadCardName } from './argv.ts'
import { bounded } from './bounds.ts'

type ArgvResult = { argv: string[] } | { refused: 'vault' | 'project' | 'view' | 'path' }

function isBadProject(value: string) {
  return isBadCardName(value) || /[\[\]"\s]/.test(value)
}

function dashboardPath(project: string) {
  return `pm/${project}/dashboard.base`
}

function isBadVault(value: string) {
  return !value || bounded(value).text !== value
}

function isBadView(value: string) {
  return !value || bounded(value).text !== value || /[\t\n\r]/.test(value)
}

export function baseQueryArgv(vault: string, project: string, view: string): ArgvResult {
  if (isBadVault(vault)) return { refused: 'vault' }
  if (isBadProject(project)) return { refused: 'project' }
  if (isBadView(view)) return { refused: 'view' }
  return { argv: ['obsidian', `vault=${vault}`, 'base:query', `path=${dashboardPath(project)}`, `view=${view}`, 'format=json'] }
}
