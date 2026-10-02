// The values obw's pane draws from. They live in $.state, which keeps JSON only: no `undefined`, no array holes (a gap is `null`).

export type ObwScope = { vault: string; project: string }

export type ObwLine = { kind: 'error' | 'notice'; text: string }

export type ObwSegment = { kind: 'markdown'; text: string } | { kind: 'mermaid'; text: string; source: string }

export type ObwHeader = { title?: string; status?: string; priority?: string }

export type ObwRelations = { parent: string[]; blocked_by: string[]; related: string[] }

export type ObwBrowser =
  | { kind: 'rendering' }
  | { kind: 'error'; message: string }
  | { kind: 'opened'; path: string; url: string | null; tailnet?: string }

export type ObwCard =
  | { kind: 'loading'; path: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'shown'
      path: string
      header: ObwHeader
      body: string
      segments: ObwSegment[]
      relations: ObwRelations
      vizRoot: string | null
      browser: ObwBrowser | null
      // Indexed by a mermaid block's position in `segments`; `null` for a block with no drawn diagram.
      diagrams: (string | null)[]
    }

export type ObwRow = {
  path: string
  key: string
  badge: 'H' | 'M' | 'L' | ' '
  title: string
  tags: string
  fullTitle: string
  fullTags: string
  priority: string | null
}

export type ObwGroup = { status: string | null; key: string; count: number; rows: ObwRow[] }

// One drawing of the pane. `request` numbers the read the drawing waits on: a write from an older one is dropped.
export type ObwPane = {
  request: number
  trail: string[]
  message: ObwLine | null
  hint: string | null
  listing: ObwLine | null
  loading: boolean
  scope: ObwScope | null
  views: string[]
  chosen: string | null
  cards: { path: string; label: string; status: string | null }[]
  groups: { groups: ObwGroup[]; hidden: number } | null
  selected: string | null
  card: ObwCard | null
}

export type ObwList = {
  query: string
  priority: 'high' | 'medium' | 'low' | null
  sort: 'priority' | 'title'
  folded: string[]
}

export type ObwRing = { at: string | null; item: string | null }

declare module 'claude-code' {
  interface PluginState {
    obw: { pane: Shaped<ObwPane>; list: ObwList; ring: ObwRing }
  }
}
