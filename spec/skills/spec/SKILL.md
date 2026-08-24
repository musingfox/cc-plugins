---
name: spec
description: >-
  Architecture spec library — propose, accept, supersede, verify, and slice
  the invariants and forward-looking interface contracts a project must not
  break. Use when writing down a rule that must survive across runs, when an
  agent needs to know what constrains the files it is about to touch, or when
  auditing whether the specs still hold. For "why we chose A over B", use adr.
---

# Architecture Spec Library

A spec entry answers **what must not change**. An ADR answers **why we chose
this**. Same directory convention, same status vocabulary, different lifespan:
an ADR is history the moment it is accepted; a spec is load-bearing until it is
superseded.

Do NOT use for: describing what the system currently looks like. That is the
code's job, and a spec that restates it becomes a drift source the first time
someone edits without updating the entry.

## Directory

Scan `docs/spec/`. If it does not exist and the user wants an entry, ask where
it should live. Override with `SPEC_DIR`.

## What earns an entry

A rule belongs here only if **its violation is silent**. The entries already in
this repo all close by naming that silence: a vendored copy drifts while both
copies still run; `rc=0` proves the process did not crash, not that the work is
done; `Edit` turns a FAIL into a PASS and the deliverable still looks like the
deliverable.

Anything that fails loudly needs no entry — the compiler catches it, or a test
goes red. If you cannot write the sentence explaining why nobody would notice
the violation, the rule probably does not belong in the library.

## Entry format

One entry per file, named `<id>.md`. The id is kebab-case and shows up as the
heading of every slice, so make it readable:

```yaml
---
id: judge-seats-cannot-edit
status: accepted            # proposed | accepted | superseded
scope:                      # file globs, never module names
  - "pi-dispatch/agents/reviewer.md"
verify: check:<shell command that exits 0 when the spec holds>
related: [other-spec-id]    # entries this one bears on
source: null                # where it came from — milestone slug, or null
adr: null                   # link when superseded
---
```

**`source` is the birth record.** An entry has two birthplaces: a milestone
settles and names an interface later flows must honour, or a flow finishes and
main finds an invariant the run revealed. Either way, write down which — a rule
whose origin nobody remembers is a rule nobody dares delete, and that is how a
spec library silts up into a layer of untouchable sediment.

`null` is honest for entries that predate a milestone. Do not invent a source to
fill the field.

The body is the text that gets pasted into a brief verbatim. Write it that way:
no "see file X", no summary-plus-detail split, nothing that needs a second pass
before an agent can act on it.

Write it as continuous prose — no headings. The structure lives in the paragraph
order, so a slice arrives as something a worker can act on rather than a nested
document:

1. **the rule** — one imperative sentence
2. **the mechanism** — how it is done, with a file or function anchor
3. **the boundary** — what is out of scope, and the legitimate exceptions
4. **the failure** — what a violation does, and why nobody sees it

Existing entries run 8–20 lines. That is a budget, not a style: one brief can
match several entries, and every line is attention spent by the worker. Longer
usually means two rules share a file (split them), or the reasoning for the
choice leaked in — that belongs in an ADR, since a spec carries only what must
not change.

**scope is globs, not module names.** Globs match the code; module names are
their own drift source. The same globs drive both `slice` and any future hook.

**`related` stays in the frontmatter, never in the body.** Links are a map for
whoever decides where to look next — they are not execution context, and a
worker who reads `[[other-spec]]` in an injected body cannot fetch it. `slice`
prints bodies only, so the map stays where it is useful and out of the brief.
Add the back-link on the other entry too; a one-way link is one you will not
find from the side you are standing on.

## verify — push each entry to the strongest form available

`test:` > `check:` > prose, in that order. Only `check:` is executable today.

Downgrade to `verify: null` when a check would produce false positives — an
untrustworthy check is worse than none, because the whole drift defence dies
with it.

A prose entry is not a weaker spec. It is **a spec not yet bound to its source
of truth**, and `verify` is that binding: `judge-seats-cannot-edit` is true
because of the `tools:` line in `reviewer.md`, and its check is what ties the
readable assertion to the executable one. An entry with no check asserts
something nothing holds it to.

So an unbound entry carries its own binding plan — a closing paragraph saying
why a check would be wrong today and what would make one possible.
`dispatch-verdict-from-file` does this: the legitimate stream reads make any
repo-wide grep a false-positive generator, so it stays prose until a narrower
assertion exists. That paragraph is what makes the debt `verify` reports every
run actionable instead of a standing complaint.

Forward-looking interface contracts are born prose: the interface does not
exist yet, so nothing can test it. Once it lands, fill the `verify` in.

Before adding a check: run it against the current code. **A check that is red
on day one is a wrong check, not wrong code.**

## Lifecycle

Anyone proposes (`status: proposed`), main accepts. Accepting is editing one
field — no approval machinery. Proposed entries are invisible to `slice`, so
unapproved rules cannot leak into execution.

Superseding: set `status: superseded`, point `adr:` at the decision that
replaced it. Keep the file — a spec's history is why the next person does not
re-propose it.

## Verbs

```bash
${CLAUDE_PLUGIN_ROOT}/scripts/spec.sh verify
${CLAUDE_PLUGIN_ROOT}/scripts/spec.sh slice <path>...
```

`verify` runs every accepted entry's check. Exit 1 is drift — a check went red.
Exit 2 is a missing library, not a passing one. Prose debt is reported every run
but never blocks.

`slice` prints the bodies of accepted entries whose scope matches any of the
given paths, each under a `## spec: <id>` heading — this is how a spec reaches a
worker. Feed it the files a task will touch, paste the output into the brief.
Empty output means nothing constrains those paths.
