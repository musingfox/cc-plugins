import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'
import { loadDeck, loadReview, repoRoot, saveReview } from './deck-store.ts'
import { rate } from './leitner.ts'
import { dueQueue } from './queue.ts'
import { drawable } from './text.ts'
import type { Card, Review } from '../types'

const PANE = 'cards'
const CARD_DEAL_ERROR = 'The deck could not be read from the Claude store.'
const NO_DECK = 'No deck for this repo yet. Run /cards build to make one.'
const KEYS = 'f flips, 1 2 3 rate, q closes. Esc hands the keys back; /cards takes them again.'

const queue = atom({ plugin: 'flashcards', key: 'queue' } as const, [] as string[])
const index = atom({ plugin: 'flashcards', key: 'index' } as const, 0)
const flipped = atom({ plugin: 'flashcards', key: 'flipped' } as const, false)
const reviewed = atom({ plugin: 'flashcards', key: 'reviewed' } as const, 0)

type Elements = { Box: any; Text: any; Button: any }

const RATINGS = [
  { rating: 1, label: '1 忘了' },
  { rating: 2, label: '2 模糊' },
  { rating: 3, label: '3 記得' },
] as const

// The repo the open pane reviews, and its review progress, which this session keeps even when the store refuses a write.
let session: { root: string; review: Review } | null = null

// The first queued card still in the deck from `from` on, with its position in the queue.
function locate(queueIds: string[], from: number, cards: Card[]): { at: number; card: Card } | null {
  for (let at = from; at < queueIds.length; at++) {
    const card = cards.find((candidate) => candidate.id === queueIds[at])
    if (card) return { at, card }
  }
  return null
}

function boxOf(review: Review, card: Card): number {
  return review[card.id]?.box ?? 1
}

// Shows the answer of the card on screen; a card that is no longer in the deck is skipped first.
async function flip($: EngineInterface) {
  if (!session) return
  const deck = await loadDeck($, session.root)
  const at = locate(await read($, queue), await read($, index), deck?.cards ?? [])
  if (!at) return
  await update($, index, () => at.at)
  await update($, flipped, () => true)
}

// Files the flipped card in its new box, saves the review, and deals the next card unflipped.
// A store that refuses the write keeps the progress for this session only.
async function rateCard($: EngineInterface, rating: 1 | 2 | 3) {
  if (!session || !(await read($, flipped))) return
  const deck = await loadDeck($, session.root)
  const at = locate(await read($, queue), await read($, index), deck?.cards ?? [])
  if (!at) return
  const now = await $.clock.now()
  session.review = { ...session.review, [at.card.id]: rate(session.review[at.card.id], rating, now) }
  await saveReview($, session.root, session.review)
  await update($, index, () => at.at + 1)
  await update($, flipped, () => false)
  await update($, reviewed, (count) => count + 1)
  await $.ui.invalidate('ui.render')
}

export async function openReview($: EngineInterface) {
  const root = await repoRoot($)
  const deck = await loadDeck($, root)
  const review = await loadReview($, root)
  session = { root, review }
  const now = await $.clock.now()
  await update($, queue, () => (deck ? dueQueue(deck.cards, review, now) : []))
  await update($, index, () => 0)
  await update($, flipped, () => false)
  await update($, reviewed, () => 0)
  await $.ui.open({ id: PANE, title: 'Flashcards', focus: true })
}

// Every screen ends with the close key, which takes the pane down whatever it shows.
async function screen($: EngineInterface, { Box, Text, Button }: Elements) {
  const deck = session ? await loadDeck($, session.root) : null
  if (!deck) return Text({ color: 'error', children: [CARD_DEAL_ERROR] })
  if (deck.cards.length === 0) return Text({ dimColor: true, children: [NO_DECK] })
  const queueIds = await read($, queue)
  if (queueIds.length === 0) {
    const boxes = [1, 2, 3].map((box) => deck.cards.filter((card) => boxOf(session!.review, card) === box).length)
    return Text({
      dimColor: true,
      children: [drawable(`Nothing due right now. ${deck.cards.length} cards: ${boxes[0]} in box 1, ${boxes[1]} in box 2, ${boxes[2]} in box 3.`)],
    })
  }
  const at = locate(queueIds, await read($, index), deck.cards)
  if (!at) return Text({ children: [drawable(`Done: ${await read($, reviewed)} cards reviewed. Run /cards again when more are due.`)] })
  const isFlipped = await read($, flipped)
  return Box({
    flexDirection: 'column',
    children: [
      Box({ key: 'progress', children: [Text({ children: [drawable(`${at.at + 1}/${queueIds.length} · box ${boxOf(session!.review, at.card)}`)] })] }),
      Box({ key: 'question', children: [Text({ wrap: 'wrap', children: [drawable(at.card.q)] })] }),
      ...(isFlipped
        ? [
            Box({ key: 'answer', children: [Text({ wrap: 'wrap', children: [drawable(at.card.a)] })] }),
            Text({ dimColor: true, children: [drawable(at.card.sourcePath)] }),
          ]
        : []),
      Box({
        flexDirection: 'row',
        gap: 2,
        children: isFlipped
          ? RATINGS.map((item) => Button({ key: `rate:${item.rating}`, label: item.label, hotkey: String(item.rating), plain: true, onPress: () => rateCard($, item.rating) }))
          : [Button({ key: 'flip', label: 'flip', hotkey: 'f', plain: true, onPress: () => flip($) })],
      }),
      Text({ dimColor: true, children: [KEYS] }),
    ],
  })
}

export function registerReview(on: On) {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button } = elements
    return Box({
      flexDirection: 'column',
      children: [
        await screen($, elements),
        Button({ key: 'close', label: 'close', hotkey: 'q', plain: true, onPress: () => $.ui.close({ id: PANE }) }),
      ],
    })
  })
}
