import { isBadCardName, dashboardPath, projectRoot } from './argv.ts'
import { bounded } from './bounds.ts'

type ArgvResult = { argv: string[] } | { refused: 'vault' | 'project' | 'view' | 'path' }

export type Scope = { vault: string; project: string }

function isBadProject(value: string) {
  return isBadCardName(value) || /[\[\]"\s]/.test(value)
}

function isBadVault(value: string) {
  return !value || bounded(value).text !== value
}

function isBadView(value: string) {
  return !value || bounded(value).text !== value || /[\t\n\r]/.test(value)
}

export function baseQueryArgv(scope: Scope, view: string): ArgvResult {
  if (isBadVault(scope.vault)) return { refused: 'vault' }
  if (isBadProject(scope.project)) return { refused: 'project' }
  if (isBadView(view)) return { refused: 'view' }
  return { argv: ['obsidian', `vault=${scope.vault}`, 'base:query', `path=${dashboardPath(scope.project)}`, `view=${view}`, 'format=json'] }
}

export function isBadCardPath(project: string, path: string) {
  const root = projectRoot(project)
  return !path.startsWith(root) || !path.endsWith('.md') || path.endsWith('/.md') ||
    bounded(path).text !== path || /[\t\n\r]/.test(path) ||
    path.split('/').some(segment => segment === '.' || segment === '..' || isBadCardName(segment))
}

export function cardPathArgv(scope: Scope, path: string): ArgvResult {
  if (isBadVault(scope.vault)) return { refused: 'vault' }
  if (isBadProject(scope.project)) return { refused: 'project' }
  if (isBadCardPath(scope.project, path)) return { refused: 'path' }
  return { argv: ['obsidian', `vault=${scope.vault}`, 'read', `path=${path}`] }
}

export function viewsArgv(scope: Scope): ArgvResult {
  if (isBadVault(scope.vault)) return { refused: 'vault' }
  if (isBadProject(scope.project)) return { refused: 'project' }
  return { argv: ['obsidian', `vault=${scope.vault}`, 'base:views', `path=${dashboardPath(scope.project)}`] }
}
