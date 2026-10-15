# flashcards

Review cards generated from your repo's documents, as a Claude Mod (`hooks/register.ts`).
`/cards build` sends the changed spec and ADR documents, and the done task cards of the
Obsidian project configured in `.obsidian.yaml`, to a background Haiku in batches of 10.
`/cards` opens a review pane that deals the due cards with a Leitner schedule; it runs
without model tokens.

## Install

Add the marketplace once, then install the plugin:

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install flashcards
```

| Command | What it does |
|---|---|
| `/cards build` | Build or refresh the deck from up to 20 changed sources |
| `/cards` | Open the review pane |

In the pane: `f` flips the card, `1` / `2` / `3` rate it (forgot / hazy / remembered), `q` closes it.

The deck and review progress are kept in Claude Code's store, keyed by the repo root, not in the repo.
