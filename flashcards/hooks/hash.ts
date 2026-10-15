const AGENT_HEADING = /^## Agent[ \t]*$/m

// Specs and ADRs are fingerprinted whole; a task card's agent log is not part of what cards are made from.
export function reviewableText(type: 'spec' | 'adr' | 'task', raw: string): string {
  if (type !== 'task') return raw
  const heading = AGENT_HEADING.exec(raw)
  return heading ? raw.slice(0, heading.index) : raw
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text) as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
