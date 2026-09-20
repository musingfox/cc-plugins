import { isBadCardName, taskFolder } from './argv.ts'
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

export function isBadCardPath(project: string, path: string) {
  const root = taskFolder(project).replace(/tasks\/$/, '')
  return !path.startsWith(root) || !path.endsWith('.md') || path.endsWith('/.md') ||
    bounded(path).text !== path || /[\t\n\r]/.test(path) ||
    path.split('/').some(segment => segment === '.' || segment === '..' || isBadCardName(segment))
}

export function cardPathArgv(vault: string, project: string, path: string): ArgvResult {
  if (isBadVault(vault)) return { refused: 'vault' }
  if (isBadProject(project)) return { refused: 'project' }
  if (isBadCardPath(project, path)) return { refused: 'path' }
  return { argv: ['obsidian', `vault=${vault}`, 'read', `path=${path}`] }
}
