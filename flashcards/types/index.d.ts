export type SourceType = 'spec' | 'adr' | 'task'

export type Kind = 'rule' | 'why' | 'what-for'

// `text` is the reviewable text the cards are generated from; `hash` fingerprints it.
export type Source = { path: string; type: SourceType; text: string; hash: string; completed: string | null }

export type Detection = { sources: Source[]; unreadable: string[]; status: 'ok' | 'error' | 'unconfigured'; message?: string }

export type Card = { id: string; sourcePath: string; sourceHash: string; kind: Kind; q: string; a: string; quote: string }

export type Deck = { v: 1; sources: Record<string, { hash: string; type: SourceType }>; cards: Card[] }

export type Box = 1 | 2 | 3

export type Review = Record<string, { box: Box; due: number }>

declare module 'claude-code' {
  interface PluginState {
    flashcards: { queue: string[]; index: number; flipped: boolean; reviewed: number }
  }
}
