import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'
import { loadDeck, loadReview, repoRoot, saveReview } from './deck-store.ts'
import { INTERVAL, rate } from './leitner.ts'
import { dueQueue } from './queue.ts'
import { drawable } from './text.ts'
import type { Box, Card, Kind, Review } from '../types'

const PANE = 'cards'
const CARD_DEAL_ERROR = '讀不到這個 repo 的牌組（Claude store 拒絕讀取）。'
const NO_DECK = '這個 repo 還沒有牌組。先跑 /cards build。'
const KEYS = 'Esc 把按鍵交回輸入框，再跑 /cards 拿回來。'
const KIND_LABEL: Record<Kind, string> = { rule: '規則', why: '為什麼', 'what-for': '用途' }
const DAY = 86_400_000

const queue = atom({ plugin: 'flashcards', key: 'queue' } as const, [] as string[])
const index = atom({ plugin: 'flashcards', key: 'index' } as const, 0)
const flipped = atom({ plugin: 'flashcards', key: 'flipped' } as const, false)
const reviewed = atom({ plugin: 'flashcards', key: 'reviewed' } as const, 0)
const tally = atom({ plugin: 'flashcards', key: 'tally' } as const, [0, 0, 0] as number[])

type Elements = { Box: any; Text: any; Button: any }

const RATINGS = [
  { rating: 1, label: '忘了' },
  { rating: 2, label: '模糊' },
  { rating: 3, label: '記得' },
] as const

// When a card filed in `box` comes back, in words.
function whenLabel(box: Box): string {
  const days = INTERVAL[box] / DAY
  return days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天後`
}

// How long until `due`, in words, rounded up.
function untilLabel(due: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((due - now) / 60_000))
  if (minutes < 60) return `${minutes} 分鐘後`
  const hours = Math.ceil(minutes / 60)
  return hours < 24 ? `${hours} 小時後` : `${Math.ceil(hours / 24)} 天後`
}

const nameOf = (path: string) => path.split('/').pop()!.replace(/\.md$/, '')

const boxBar = (counts: number[]) => counts.map((count, i) => `第 ${i + 1} 格 ${count}`).join(' · ')

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
  await update($, tally, (counts) => counts.map((count, i) => (i === rating - 1 ? count + 1 : count)))
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
  await update($, tally, () => [0, 0, 0])
  await $.ui.open({ id: PANE, title: 'Flashcards', focus: true })
}

// Every screen ends with the close key, which takes the pane down whatever it shows.
async function screen($: EngineInterface, { Box, Text, Button }: Elements) {
  const deck = session ? await loadDeck($, session.root) : null
  if (!deck) return Text({ color: 'error', children: [CARD_DEAL_ERROR] })
  if (deck.cards.length === 0) return Text({ dimColor: true, children: [NO_DECK] })
  const review = session!.review
  const boxes = [1, 2, 3].map((box) => deck.cards.filter((card) => boxOf(review, card) === box).length)
  const now = await $.clock.now()
  const nextDue = () => {
    const dues = deck.cards.map((card) => review[card.id]?.due ?? 0).filter((due) => due > now)
    return dues.length ? `下一張 ${untilLabel(Math.min(...dues), now)}到期。` : ''
  }
  const queueIds = await read($, queue)
  if (queueIds.length === 0) {
    return Box({
      flexDirection: 'column',
      children: [
        Text({ dimColor: true, children: [drawable(`現在沒有到期的卡。${nextDue()}`)] }),
        Text({ dimColor: true, children: [drawable(`共 ${deck.cards.length} 張：${boxBar(boxes)}`)] }),
      ],
    })
  }
  const at = locate(queueIds, await read($, index), deck.cards)
  if (!at) {
    const [forgot, fuzzy, known] = await read($, tally)
    return Box({
      flexDirection: 'column',
      children: [
        Text({ bold: true, children: [drawable(`這輪複習完 ${await read($, reviewed)} 張：記得 ${known}、模糊 ${fuzzy}、忘了 ${forgot}。`)] }),
        Text({ dimColor: true, children: [drawable(`${nextDue() || '再跑 /cards 看看有沒有新到期的卡。'}`)] }),
        Text({ dimColor: true, children: [drawable(`共 ${deck.cards.length} 張：${boxBar(boxes)}`)] }),
      ],
    })
  }
  const card = at.card
  const box = boxOf(review, card)
  const isFlipped = await read($, flipped)
  const label = (mark: string, text: string, key: string, color: string, marginTop = 0) =>
    Box({
      key: `${key}-row`,
      flexDirection: 'row',
      marginTop,
      children: [Text({ bold: true, color, children: [`${mark}  `] }), Box({ key, flexShrink: 1, children: [Text({ wrap: 'wrap', children: [drawable(text)] })] })],
    })
  const nextBox = (rating: 1 | 2 | 3): Box => rate(review[card.id], rating, 0).box
  return Box({
    flexDirection: 'column',
    children: [
      Box({
        key: 'progress',
        flexDirection: 'row',
        justifyContent: 'space-between',
        children: [
          Text({ dimColor: true, children: [drawable(`${KIND_LABEL[card.kind]} · ${nameOf(card.sourcePath)}`)] }),
          Text({ dimColor: true, children: [drawable(`${at.at + 1}/${queueIds.length} · 第 ${box} 格`)] }),
        ],
      }),
      Box({ key: 'gap', height: 1, children: [] }),
      label('問', card.q, 'question', 'claude'),
      ...(isFlipped
        ? [
            label('答', card.a, 'answer', 'success', 1),
            Box({ key: 'quote', paddingLeft: 4, children: [Text({ italic: true, dimColor: true, wrap: 'wrap', children: [drawable(`“${card.quote}”`)] })] }),
            Box({ key: 'source', paddingLeft: 4, children: [Text({ dimColor: true, children: [drawable(`${deck.sources[card.sourcePath]?.type === 'task' ? 'Obsidian vault' : 'repo'} · ${card.sourcePath}`)] })] }),
          ]
        : []),
      Box({
        key: 'actions',
        marginTop: 1,
        flexDirection: 'row',
        gap: 2,
        children: isFlipped
          ? RATINGS.map((item) =>
              Button({ key: `rate:${item.rating}`, label: `${item.label}·${whenLabel(nextBox(item.rating))}`, hotkey: String(item.rating), plain: true, onPress: () => rateCard($, item.rating) }),
            )
          : [Button({ key: 'flip', label: '翻面', hotkey: 'f', plain: true, onPress: () => flip($) })],
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
        Button({ key: 'close', label: '關閉', hotkey: 'q', plain: true, onPress: () => $.ui.close({ id: PANE }) }),
      ],
    })
  })
}
