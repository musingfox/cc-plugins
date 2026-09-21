const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/

// A name that would empty, widen or escape the path it is put into.
export function isBadCardName(value: string) {
  return !value || value === '.' || value === '..' || value.includes('/') || CONTROLS.test(value)
}

export function projectRoot(project: string) {
  return `pm/${project}/`
}

export function taskFolder(project: string) {
  return `${projectRoot(project)}tasks/`
}
