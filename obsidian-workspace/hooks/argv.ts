export type ArgvResult = { argv: string[] } | { refused: 'vault' | 'project' | 'card' }

const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/

// A name that would empty, widen or escape the path it is put into.
export function isBadCardName(value: string) {
  return !value || value === '.' || value === '..' || value.includes('/') || CONTROLS.test(value)
}

// The project also goes into the search query, where brackets, quotes and spaces change its meaning.
function isBadProject(value: string) {
  return isBadCardName(value) || /[\[\]"\s]/.test(value)
}

export function taskFolder(project: string) {
  return `pm/${project}/tasks/`
}

export function listArgv(vault: string, project: string): ArgvResult {
  if (!vault) return { refused: 'vault' }
  if (isBadProject(project)) return { refused: 'project' }
  return {
    argv: [
      'obsidian',
      `vault=${vault}`,
      'search',
      `query=[type:task] [project:${project}] -[status:done]`,
      `path=pm/${project}`,
      'format=json',
    ],
  }
}

export function cardArgv(vault: string, project: string, card: string): ArgvResult {
  if (!vault) return { refused: 'vault' }
  if (isBadProject(project)) return { refused: 'project' }
  if (isBadCardName(card)) return { refused: 'card' }
  return { argv: ['obsidian', `vault=${vault}`, 'read', `path=${taskFolder(project)}${card}.md`] }
}
