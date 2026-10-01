---
name: docs
description: Audit a repository's docs — README, CONTRIBUTING, CLAUDE.md and AGENTS.md at every level, docs/, spec and ADR entries — and re-layer them so each fact lives where it cannot drift.
disable-model-invocation: true
argument-hint: "[repo path]"
---

# Audit repository docs

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

## Core and modules

Every repo gets the core. `README.md` tells a human what the project is and how to
install and use it. The root `CLAUDE.md` carries the rules and pointers every session
needs, and points at the README instead of restating it. `AGENTS.md` follows the rules in
[references/platform.md](references/platform.md#loading).

Everything else is a module. Read a module's reference only when its signal fires, so an
audit of a small repo loads the core alone.

| Module | Reference | Signal |
|---|---|---|
| Architecture | [architecture.md](references/architecture.md) | an `ARCHITECTURE.md`; a codemap inside another doc; more than about 10,000 lines of code |
| Contributing | [contributing.md](references/contributing.md) | a `CONTRIBUTING` file in the root, `docs/` or `.github/`; process rules inside `CLAUDE.md`; hooks the repo itself sets, found with `git config --show-origin core.hooksPath` and `.git/hooks` |
| Nested | [nested.md](references/nested.md) | a `CLAUDE.md` or `AGENTS.md` below the root; `.claude/rules/`; workspaces or package manifests below the root; a rule that matters in one directory |
| Invariants, decisions, terms | load `/spec:spec`, `/adr:adr` or `/spec:glossary` before editing an entry | `docs/spec/`, `docs/decisions/` or `docs/adr/`, `CONTEXT.md`; a constraint or decision candidate |
| UI design | [design.md](references/design.md) | a frontend framework, design tokens or stylesheets |
| Operations | [operations.md](references/operations.md) | IaC or deploy config: terraform, `wrangler.*`, compose files, k8s manifests |

How a module fires decides the move it allows:

- **A doc of the module exists.** Audit it.
- **The module's content sits in another doc.** Propose moving it to the module's home.
- **Only the repo signal fires.** Ask the human the module's question with
  AskUserQuestion. Create the file only from content the answer supplies.

## 1. Inventory

List every doc and how it reaches its reader: `README.md` and `CONTRIBUTING` at every
level, root and nested `CLAUDE.md` and `AGENTS.md`, `.claude/rules/` files and their
`paths:`, `@` imports, `docs/`, the spec and ADR directories, and the instructions other
tools read, such as `.coderabbit.yaml`, `.github/copilot-instructions.md` and
`.cursor/rules/`. Read what each doc says about itself — a section that states it keeps
closed history on purpose is a design, not sediment. Load mechanics are in [references/platform.md](references/platform.md).

Then check every module's signal against the repo and the docs you listed.

Done when every doc is listed with its load path and any intent it states, and every
module is marked fired, with how, or silent. A module whose signal first shows during
classification fires then.

## 2. Classify

Dispatch one `audit:docs-classifier` per doc longer than 500 lines, in parallel, each
with its own report path and the references of the fired modules; read shorter docs
yourself and write each one's section-to-kind map into the proposal. A classifier returns
each section's kinds with line ranges, a drift sample, duplicates across docs, and
anchors.

Done when every section of every doc has a kind.

## 3. Verify

A classifier's output is a lead list. Confirm each claim yourself before it enters a
proposal, against the code, or by running the tool when the claim is about what a tool
reads or does: every drift, every "this reason is written only here",
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
  removes the class of drift rather than one instance. An index of another doc set is the
  same cache: a spec list in `CLAUDE.md` or review-bot instructions that restate the
  specs name their source. Cite by section or ID, since a
  line number moves when anything above it changes. Closed history rows keep the values
  that were true when they closed.
- **Constraint against code.** Put the disagreement to the human with AskUserQuestion.
  A rule a test enforces loudly needs one clause and the test's name; a rule whose
  violation is silent belongs in `/spec:spec`.
- **Decision.** Run the warrant test from `/adr:adr` before proposing an ADR. A repo
  that already keeps its decision record — a numbered architecture section that code
  cites — gets no second copy. A decision that was surfaced but never made goes to the
  human to make.
- **Placement.** A passage moves to the home the core or a fired module names for it.
  The repo's own convention wins over a module's default name.
- **Spec binding.** A spec entry's `verify:` runs an in-repo test, so CI can run it; a
  checker that lives in a plugin never reaches CI. An entry still `proposed` stays
  unenforced. A new or repointed `verify:` is green on the current code and red on a
  scratch violation before it ships, and an entry whose check can false-positive stays
  unbound, as `/spec:spec` rules.

Done when every proposed change names its kind, its source of truth and its anchors;
every module is listed as fired, with how, or silent; and every finding is applied, put
to the human with AskUserQuestion, or ruled out of scope.

## 6. Apply

Work in a worktree off the default branch, one commit per topic. A change outside the
docs — tests, CI, bot config — ships only when the option the human approved names it. Run the repo's suite
and every test that reads a doc. Each new nested `CLAUDE.md` gets a load receipt —
[references/platform.md](references/platform.md#load-receipt).

Done when the suite is green and every new nested file has its receipt.

---

First run: cyris, 2026-10-01 (musingfox/cyris#25).
