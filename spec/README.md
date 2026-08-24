# spec — Architecture Spec Library

## Problem

Architectural decisions evaporate. A design session settles that an interface
must not change, or that a seat must never hold a certain tool — and that
knowledge lives in a transcript nobody rereads. The next worker rediscovers it
by breaking it.

Reading the code does not recover it. Code says *what is*, never *what must not
change*; it costs context that a spec compresses away; and it cannot describe
an interface that has not been written yet — which is exactly the case when
parallel workers must build against each other's not-yet-existing output.

This is not what an ADR is for. An ADR records **why we chose A over B** — it
is history the moment it is accepted. A spec records **what must not change** —
it is load-bearing until superseded. Same directory convention, same status
vocabulary, opposite lifespans.

## Solution

One markdown entry per invariant in `docs/spec/`, carrying a scope (file globs)
and a verify (an executable check where one is trustworthy). Two verbs:

- `verify` — run every accepted entry's check; red means drift
- `slice <path>...` — print the entries constraining those paths, ready to
  paste into a worker's brief

Slicing is the point. A spec library nobody reads is a document; a spec library
that injects itself into the brief of whoever is about to touch the code is a
constraint.

## An entry

```markdown
---
id: judge-seats-cannot-edit
status: accepted            # proposed | accepted | superseded
scope:
  - "pi-dispatch/agents/reviewer.md"
  - "context-flow/agents/review.md"
verify: check:! grep -h '^tools:' pi-dispatch/agents/reviewer.md context-flow/agents/review.md | grep -qw Edit
related: [dispatch-verdict-from-file]
adr: null
---
A seat that renders a verdict must not hold `Edit`. The tools whitelist in an
agent's frontmatter is the only hard boundary between seats — prose in a system
prompt is soft and drifts, a missing tool does not.
```

The body is written to be pasted into a brief verbatim — no summary-plus-detail
split, nothing needing a second pass before an agent can act on it.

## Usage

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/spec.sh verify
${CLAUDE_PLUGIN_ROOT}/scripts/spec.sh slice context-flow/scripts/cf-pi-env.sh
```

Or through the `spec` skill, which covers the lifecycle: propose (`status:
proposed`), main accepts, supersede with a link to the ADR that replaced it.

`verify` exits 1 on drift and 2 on a missing library — never 0 for either.
`SPEC_DIR` overrides the default `docs/spec`.

## Design notes

**Globs, not module names.** Globs match the code. Module names are their own
drift source.

**A red check on day one is a wrong check.** An untrustworthy check kills the
whole drift defence, so an entry whose check would produce false positives is
downgraded to `verify: null` and reported as debt every run.

**`related` is a map, not content.** Links live in the frontmatter and never in
the body: they tell whoever is deciding where to look next which entries bear on
this one, but a worker reading an injected body cannot fetch them. `slice`
prints bodies only, so the map stays out of the brief.

**Prose entries are debt, not a resting place.** Forward-looking contracts are
born prose — nothing can test an interface that does not exist — and get their
verify filled in once it lands.

## Not done yet

Brief injection is manual: run `slice`, paste the output. Wiring it into a
dispatcher (context-flow's brief builder) and a pre-commit reminder are the
next steps, deliberately deferred until slicing has run against real work.
