import type { EngineInterface, On } from 'claude-code'
import { loadDeck, loadReview, repoRoot, saveDeck, saveReview } from './deck-store.ts'
import { reconcile } from './reconcile.ts'
import { repoSources } from './repo-sources.ts'
import { vaultSources } from './vault-sources.ts'

const UNREADABLE = 'Flashcards deck could not be read; build stopped so it is not overwritten.'
const UNSAVED = 'Flashcards deck could not be saved; build stopped.'

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
}

export function registerBuild(_on: On) {}
