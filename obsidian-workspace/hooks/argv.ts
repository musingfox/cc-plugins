export type ArgvResult = { argv: string[] } | { refused: 'vault' | 'project' | 'card' }
const controls = /[\u0000-\u001f\u007f-\u009f]/
export function cardNameProblem(value: string) { return !value || value === '.' || value === '..' || value.includes('/') || controls.test(value) }
function projectProblem(value: string) { return cardNameProblem(value) || /[\[\]"\s]/.test(value) }
export function listArgv(vault: string, project: string): ArgvResult {
  if (!vault) return { refused: 'vault' }; if (projectProblem(project)) return { refused: 'project' }
  return { argv: ['obsidian', `vault=${vault}`, 'search', `query=[type:task] [project:${project}] -[status:done]`, `path=pm/${project}`, 'format=json'] }
}
export function cardArgv(vault: string, project: string, card: string): ArgvResult {
  if (!vault) return { refused: 'vault' }; if (projectProblem(project)) return { refused: 'project' }; if (cardNameProblem(card)) return { refused: 'card' }
  return { argv: ['obsidian', `vault=${vault}`, 'read', `path=pm/${project}/tasks/${card}.md`] }
}
