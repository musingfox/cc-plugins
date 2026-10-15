import type { EngineInterface, On } from 'claude-code'
import { loadDeck, loadReview, repoRoot, saveDeck, saveReview } from './deck-store.ts'
import { batchPrompt } from './prompt.ts'
import { reconcile } from './reconcile.ts'
import { repoSources } from './repo-sources.ts'
import { selectBuild } from './select.ts'
import type { Deck, Source } from '../types'
import { vaultSources } from './vault-sources.ts'

const UNREADABLE = 'Flashcards deck could not be read; build stopped so it is not overwritten.'
const UNSAVED = 'Flashcards deck could not be saved; build stopped.'
const NO_SOURCES = 'No sources found. Add docs/spec/*.md, an ADR directory, or a .obsidian.yaml with pm.project.'

// The batch each background agent runs, by the agent's id.
const tracked = new Map<string, Source[]>()

export function resetBuild() {}

// The command returns at once; the continuation reads the repo and vault and prunes the deck in the background.
export async function startBuild($: EngineInterface) {
  void continueBuild($)
}

async function continueBuild($: EngineInterface) {
  const root = await repoRoot($)
  const deck = await loadDeck($, root)
  if (!deck) return $.ui.toast(UNREADABLE)
  const repo = await repoSources($, root)
  const vault = await vaultSources($)
  if (vault.status === 'error') await $.ui.toast(`Vault task cards skipped: ${vault.message}`)
  const { deck: reconciled, removedCardIds } = reconcile(deck, repo, vault)
  if (!(await saveDeck($, root, reconciled))) return $.ui.toast(UNSAVED)
  if (removedCardIds.length) {
    const review = await loadReview($, root)
    for (const id of removedCardIds) delete review[id]
    await saveReview($, root, review)
  }
  await startBatches($, reconciled, [...repo.sources, ...vault.sources])
}

// Every agent id a batch has been given, kept after the batch merges: a finished agent must not be claimed again.
const claimed = new Set<string>()

async function unclaimedAgent($: EngineInterface): Promise<string | undefined> {
  const agents = await $.agent.list()
  return agents.find((agent) => agent.spawnedBy === 'flashcards' && !claimed.has(agent.id))?.id
}

async function spawnBatch($: EngineInterface, batch: Source[]): Promise<void> {
  let result: { agentId?: string; deny?: string }
  try {
    result = await $.agent.spawn({ prompt: batchPrompt(batch), model: 'haiku', description: `Flashcards: ${batch.length} sources` })
  } catch {
    return
  }
  if (result.deny) return
  const agentId = result.agentId ?? (await unclaimedAgent($))
  if (agentId) {
    claimed.add(agentId)
    tracked.set(agentId, batch)
  }
}

async function startBatches($: EngineInterface, deck: Deck, sources: Source[]) {
  if (sources.length === 0) return $.ui.toast(NO_SOURCES)
  const { batches, remaining } = selectBuild(deck, sources)
  if (batches.length === 0) return $.ui.toast(`Flashcards deck is up to date: ${deck.cards.length} cards from ${sources.length} sources.`)
  const selected = batches.reduce((count, batch) => count + batch.length, 0)
  await $.ui.toast(`Building flashcards from ${selected} sources in ${batches.length} batch(es) in the background; ${remaining} more sources wait for a later build.`)
  for (const batch of batches) await spawnBatch($, batch)
}

export function registerBuild(_on: On) {}
