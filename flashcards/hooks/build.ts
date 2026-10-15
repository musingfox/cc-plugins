import type { EngineInterface, On } from 'claude-code'
import { acceptCards } from './accept.ts'
import { loadDeck, loadReview, repoRoot, saveDeck, saveReview } from './deck-store.ts'
import { batchPrompt } from './prompt.ts'
import { reconcile } from './reconcile.ts'
import { parseReply } from './reply.ts'
import { repoSources } from './repo-sources.ts'
import { selectBuild } from './select.ts'
import type { Deck, Source } from '../types'
import { vaultSources } from './vault-sources.ts'

const UNREADABLE = 'Flashcards deck could not be read; build stopped so it is not overwritten.'
const UNSAVED = 'Flashcards deck could not be saved; build stopped.'
const NO_SOURCES = 'No sources found. Add docs/spec/*.md, an ADR directory, or a .obsidian.yaml with pm.project.'

const GUARD_MS = 30 * 60 * 1000
const BUSY = 'A flashcards build is already running; wait for its report.'

// Set from the build's start until its report, or until a build stops before it spawns anything.
let inFlight: { startedAt: number } | null = null

// One /cards build: its batches settle into this tally, and the last settle reports it.
type Build = {
  root: string
  outstanding: number
  added: number
  dropped: number
  failedSources: number
  recordedSources: number
  pendingBefore: number
}

type Batch = { build: Build; sources: Source[] }

// The batch each background agent runs, by the agent's id.
const tracked = new Map<string, Batch>()

export function resetBuild() {
  inFlight = null
}

// The command returns at once; the continuation reads the repo and vault and prunes the deck in the background.
// A second build inside the guard window is refused, so two builds never spend tokens on the same sources.
export async function startBuild($: EngineInterface) {
  const now = await $.clock.now()
  if (inFlight && now - inFlight.startedAt < GUARD_MS) return $.ui.toast(BUSY)
  inFlight = { startedAt: now }
  void continueBuild($).catch((error: unknown) => stop($, `Flashcards build stopped: ${error instanceof Error ? error.message : String(error)}`).catch(() => {}))
}

async function stop($: EngineInterface, text: string) {
  inFlight = null
  await $.ui.toast(text)
}

async function continueBuild($: EngineInterface) {
  const root = await repoRoot($)
  const deck = await loadDeck($, root)
  if (!deck) return stop($, UNREADABLE)
  const repo = await repoSources($, root)
  const vault = await vaultSources($)
  if (vault.status === 'error') await $.ui.toast(`Vault task cards skipped: ${vault.message}`)
  const { deck: reconciled, removedCardIds } = reconcile(deck, repo, vault)
  if (!(await saveDeck($, root, reconciled))) return stop($, UNSAVED)
  if (removedCardIds.length) {
    const review = await loadReview($, root)
    for (const id of removedCardIds) delete review[id]
    await saveReview($, root, review)
  }
  await startBatches($, root, reconciled, [...repo.sources, ...vault.sources])
}

// Every agent id a batch has been given, kept after the batch merges: a finished agent must not be claimed again.
const claimed = new Set<string>()

async function unclaimedAgent($: EngineInterface): Promise<string | undefined> {
  const agents = await $.agent.list()
  return agents.find((agent) => agent.spawnedBy === 'flashcards' && !claimed.has(agent.id))?.id
}

// The last batch to settle reports the build: what was added, dropped and failed, and what is still pending.
async function settle($: EngineInterface, batch: Batch, outcome: { added: number; dropped: number } | 'failed') {
  const { build } = batch
  build.outstanding -= 1
  if (outcome === 'failed') {
    build.failedSources += batch.sources.length
  } else {
    build.added += outcome.added
    build.dropped += outcome.dropped
    build.recordedSources += batch.sources.length
  }
  if (build.outstanding === 0) {
    inFlight = null
    const remaining = build.pendingBefore - build.recordedSources
    await $.ui.toast(`Flashcards: ${build.added} cards added, ${build.dropped} dropped, ${build.failedSources} sources failed, ${remaining} sources remain.`)
    await $.ui.invalidate('ui.render')
  }
}

async function spawnBatch($: EngineInterface, batch: Batch): Promise<void> {
  let result: { agentId?: string; deny?: string }
  try {
    result = await $.agent.spawn({ prompt: batchPrompt(batch.sources), model: 'haiku', description: `Flashcards: ${batch.sources.length} sources` })
  } catch {
    return settle($, batch, 'failed')
  }
  if (result.deny) return settle($, batch, 'failed')
  const agentId = result.agentId ?? (await unclaimedAgent($))
  if (!agentId) return settle($, batch, 'failed')
  claimed.add(agentId)
  tracked.set(agentId, batch)
}

async function startBatches($: EngineInterface, root: string, deck: Deck, sources: Source[]) {
  if (sources.length === 0) return stop($, NO_SOURCES)
  const { batches, pendingCount, remaining } = selectBuild(deck, sources)
  if (batches.length === 0) return stop($, `Flashcards deck is up to date: ${deck.cards.length} cards from ${sources.length} sources.`)
  const selected = batches.reduce((count, batch) => count + batch.length, 0)
  await $.ui.toast(`Building flashcards from ${selected} sources in ${batches.length} batch(es) in the background; ${remaining} more sources wait for a later build.`)
  const build: Build = { root, outstanding: batches.length, added: 0, dropped: 0, failedSources: 0, recordedSources: 0, pendingBefore: pendingCount }
  for (const sources of batches) await spawnBatch($, { build, sources: sources })
}

// A reply is merged only when it parses and the stored deck can be read; otherwise the batch's sources stay pending.
async function merge($: EngineInterface, batch: Batch, reply: { reason: string; answer: string }) {
  const { root } = batch.build
  const raw = reply.reason === 'answer' ? parseReply(reply.answer) : null
  const deck = raw ? await loadDeck($, root) : null
  if (!raw || !deck) return settle($, batch, 'failed')
  const { accepted, dropped } = await acceptCards(raw, batch.sources)
  const paths = new Set(batch.sources.map((source) => source.path))
  const replacedIds = deck.cards.filter((card) => paths.has(card.sourcePath)).map((card) => card.id)
  const next: Deck = {
    ...deck,
    sources: { ...deck.sources, ...Object.fromEntries(batch.sources.map((source) => [source.path, { hash: source.hash, type: source.type }])) },
    cards: [...deck.cards.filter((card) => !paths.has(card.sourcePath)), ...accepted],
  }
  if (!(await saveDeck($, root, next))) return settle($, batch, 'failed')
  if (replacedIds.length) {
    const review = await loadReview($, root)
    for (const id of replacedIds) delete review[id]
    await saveReview($, root, review)
  }
  await settle($, batch, { added: accepted.length, dropped: dropped.length })
}

// Merges run one at a time: each reads the stored deck, so two batches that finish together would lose one write.
let merging: Promise<void> = Promise.resolve()

export function registerBuild(on: On) {
  on('turn.complete', async ($, e, next) => {
    const batch = e.agentId === undefined ? undefined : tracked.get(e.agentId)
    if (batch && e.agentId !== undefined) {
      tracked.delete(e.agentId)
      await (merging = merging.then(() => merge($, batch, e)).catch(() => {}))
    }
    return next(e)
  })
}
