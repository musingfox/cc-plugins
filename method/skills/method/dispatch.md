# Dispatching a sub-contract

The muster skill owns the CLI: flags, model and effort table, watch, answer, follow-up, collect, cleanup. Read `muster/skills/muster/SKILL.md` for every command; this file says only what a node adds.

## The ticket carries contracts.json verbatim

Build the ticket as a file and pass it with `--ticket-file`. Muster embeds that file in the ticket verbatim (`muster/src/run-args.ts:90-92`), so the contracts arrive exactly as you checked them. Assemble it with `cat`, never by retyping: a retyped contract is a second copy that drifts from the one the gates and the review read.

A ticket file holds, in order:

1. **A head you write**: the goal this sub-contract serves in your contract, the base commit, the full test command (it must pass in an isolated clone with no live services, shared ports or external daemons), the load-bearing assumptions it rests on with their receipts, and the line telling the node to read the method skill at its absolute path, `<plugin root>/skills/method/SKILL.md` (the plugin root SKILL.md names). A muster worker loads no user or project settings, so it may not have this skill; that read lands outside its worktree and reaches you as a question to allow.
2. **The contracts**, `cat` of the sub-node's `contracts.json`, inside a fence labelled `contracts.json`. The node writes it back out to a file for the gates.
3. **The report shape**, `cat` of `<plugin root>/skills/method/report.md`, so every node reports the same way whatever it loaded.

## Nested muster runs

A muster worker dispatches nested runs by the absolute path of the muster CLI, `bun <abs path>/muster/src/muster.ts run ...`; it knows no plugin root for muster.

A middle node points each leaf's `--repo` at its **own clone** (its worktree), not at the top repository. The leaf branches come back into that clone; the middle node merges them into its branch. One fetch-back then carries the whole result up.

Pick each run's `--model` and `--effort` by the muster skill's table. Independent sub-contracts start together; one with a `depends` starts after the branch it consumes is merged, from `--base` at that merge.

## Agent seats

Review, probe, prototype and divergence are agents: each needs a context of its own and the model its definition pins. With the Agent tool, dispatch them by `subagent_type` (`cf:review`, `spiral:probe`, `spiral:prototype`, `spiral:divergence`). A muster worker has no Agent tool. There, dispatch the seat as a nested muster run whose ticket file is `cat` of the agent's definition (`context-flow/agents/review.md`, `spiral/agents/<seat>.md`) followed by its inputs, on the model and effort that definition pins (`opus` `high` for review). Merge nothing from a seat's run: read its report and its files only.

## An information session

For `route.md`'s one information round, dispatch the cheapest seat that can answer: the `haiku` or `sonnet` row of the muster table, or an Explore subagent where the Agent tool exists. Its ticket is the question and the files to look in; it writes code nowhere.

Done: every dispatched run has a ticket file built from `cat`, a run name you recorded, and a `watch` running.
