---
name: docs
description: Audit a repository's agent-facing docs — CLAUDE.md and AGENTS.md at every level, docs/, spec and ADR entries — and re-layer them so each fact lives where it cannot drift.
disable-model-invocation: true
argument-hint: "[repo path]"
---

# Audit agent-facing docs

A doc earns its place by carrying what the code cannot say: why a choice was made, what
must not change, and lookups too expensive to redo. Everything else the code already
says, and a doc restating it is a *cache* that drifts.

Every section of a doc is one of four kinds. The kind decides who wins when the doc and
the code disagree:

| Kind | What it holds | When it disagrees with the code |
|---|---|---|
| **History** | how past work went, true as of its date | nothing to sync; a new record supersedes it, and a header that claims it is current gets marked historical |
| **Constraint** | what must or must not hold | the code may be the bug: the human decides before either side changes |
| **Decision** | why A and not B, still in force | the human decides; a changed decision gets a new record, the old reason stays |
| **Current state** | what the code or system is now | the code wins, and the doc is fixed in the same change |

Only current state is a cache, and it is where drift lives: counts, lists, maps,
precedence claims.

## 1. Inventory

List every agent-facing doc and how it reaches an agent: root and nested `CLAUDE.md` and
`AGENTS.md`, `.claude/rules/` files and their `paths:`, `@` imports, `docs/`, the spec
and ADR directories. Read what each doc says about itself — a section that states it
keeps closed history on purpose is a design, not sediment. Load mechanics are in
[references/platform.md](references/platform.md).

Done when every doc is listed with its load path and any intent it states.

## 2. Classify

Dispatch one `audit:docs-classifier` per doc longer than 500 lines, in parallel, each
with its own report path; read shorter docs yourself. A classifier returns each
section's kinds with line ranges, a drift sample, duplicates across docs, and anchors.

Done when every section of every doc has a kind.

## 3. Verify

A classifier's output is a lead list. Confirm each claim against the code yourself
before it enters a proposal: every drift, every "this reason is written only here",
every decision candidate. On the first run, both decision candidates a classifier
proposed failed the warrant test, and one "written only here" claim was false.

Done when every claim you will act on cites a check you ran.

## 4. Find anchors

Collect what pins the docs' current shape: tests that read a doc or split it on its
headings, code and tests that cite a section or item number, citations into a doc by
line number. A move or rename keeps each anchor working or updates it in the same
change.

Done when every doc you will change has its anchor list.

## 5. Propose, by kind

- **Current state.** Eliminate before you correct: a count, list or index names its
  source instead ("every key in `GRADE_D_KEYS`", "every table in `schema.sql`"), which
  removes the class of drift rather than one instance. Cite by section or ID, since a
  line number moves when anything above it changes. Closed history rows keep the values
  that were true when they closed.
- **Constraint against code.** Put the disagreement to the human with AskUserQuestion.
  A rule a test enforces loudly needs one clause and the test's name; a rule whose
  violation is silent belongs in `/spec:spec`.
- **Decision.** Run the warrant test from `/adr:adr` before proposing an ADR. A repo
  that already keeps its decision record — a numbered architecture section that code
  cites — gets no second copy. A decision that was surfaced but never made goes to the
  human to make.
- **Relocation.** A rule that matters in one directory moves into that directory's
  `CLAUDE.md`, rules only, starting with the directories that change most
  (`git log --name-only`). The parent keeps a one-line pointer for a session that
  creates a file there before reading one. Follow the repo's `AGENTS.md` convention. A
  rule spread over scattered paths becomes a `.claude/rules/` file with `paths:`.
- **Spec binding.** A spec entry's `verify:` runs an in-repo test, so CI can run it; a
  checker that lives in a plugin never reaches CI. An entry still `proposed` stays
  unenforced. A new check is green on the current code and red on a scratch violation
  before it ships.

Done when every proposed change names its kind, its source of truth and its anchors,
and every open question has gone to the human.

## 6. Apply

Work in a worktree off the default branch, one commit per topic. Run the repo's suite
and every test that reads a doc. Each new nested `CLAUDE.md` gets a load receipt —
[references/platform.md](references/platform.md#load-receipt).

Done when the suite is green and every new nested file has its receipt.

---

First run: cyris, 2026-10-01 (musingfox/cyris#25).
