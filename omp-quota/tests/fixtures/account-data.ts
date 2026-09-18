const ACCOUNT_KEYS = new Set(['metadata', 'email', 'accountId', 'orgId', 'orgName', 'projectId', 'endpoint'])

export function accountDataIn(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return []
  const found: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (ACCOUNT_KEYS.has(key) || (typeof child === 'string' && child.includes('@'))) found.push(childPath)
    found.push(...accountDataIn(child, childPath))
  }
  return found
}
