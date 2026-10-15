import type { EngineInterface } from 'claude-code'
import { hashText } from './hash.ts'
import type { Deck, Review } from '../types'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export async function repoKey(root: string): Promise<string> {
  return (await hashText(root)).slice(0, 16)
}

const KINDS: readonly string[] = ['rule', 'why', 'what-for']
const CARD_TEXT_FIELDS = ['id', 'sourcePath', 'sourceHash', 'q', 'a', 'quote'] as const

// A card the pane can draw and the build can merge: every text field a string, and a known kind.
const isCard = (value: unknown) => isRecord(value) && CARD_TEXT_FIELDS.every((key) => typeof value[key] === 'string') && KINDS.includes(value.kind as string)

// The store answers nothing for an absent key; a value of another shape or version, or a card with a bad field, is not a deck.
function deckOf(value: unknown): Deck | null {
  if (value === undefined || value === null) return { v: 1, sources: {}, cards: [] }
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.sources) || !Array.isArray(value.cards) || !value.cards.every(isCard)) return null
  return value as unknown as Deck
}

function reviewOf(value: unknown): Review {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) return {}
  const valid = Object.values(value).every((entry) => isRecord(entry) && [1, 2, 3].includes(entry.box as number) && typeof entry.due === 'number')
  return valid ? (value as Review) : {}
}

export async function loadDeck($: EngineInterface, root: string): Promise<Deck | null> {
  try {
    return deckOf(await $.store.get(`deck:${await repoKey(root)}`))
  } catch {
    return null
  }
}

export async function saveDeck($: EngineInterface, root: string, deck: Deck): Promise<boolean> {
  try {
    await $.store.set(`deck:${await repoKey(root)}`, deck)
    return true
  } catch {
    return false
  }
}

export async function loadReview($: EngineInterface, root: string): Promise<Review> {
  try {
    return reviewOf(await $.store.get(`review:${await repoKey(root)}`))
  } catch {
    return {}
  }
}

export async function saveReview($: EngineInterface, root: string, review: Review): Promise<boolean> {
  try {
    await $.store.set(`review:${await repoKey(root)}`, review)
    return true
  } catch {
    return false
  }
}

// The repo's root as the session knows it: the repo, then the session's root, then its working directory.
export async function repoRoot($: EngineInterface): Promise<string> {
  const lookups = [async () => (await $.session.repo())?.root, () => $.session.root(), () => $.session.cwd()]
  for (const lookup of lookups) {
    try {
      const root = await lookup()
      if (root) return root
    } catch {
      // This lookup failed; the next one answers.
    }
  }
  return ''
}
