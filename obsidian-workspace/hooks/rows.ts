export function resolveArgument(argument: string, views: string[]): { kind: 'none' } | { kind: 'view'; view: string } | { kind: 'card'; card: string } {
  if (!argument.trim()) return { kind: 'none' }
  return views.includes(argument) ? { kind: 'view', view: argument } : { kind: 'card', card: argument }
}
