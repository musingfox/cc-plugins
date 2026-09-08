# Writing for agents

The judgment layer for any document an agent consumes: a skill, `CLAUDE.md`, a file
reached by a pointer. It answers three questions the mechanics cannot: does this
material earn its place, where on the hierarchy does it sit, and which words make it
fire.

The mechanics live elsewhere — frontmatter fields, directory layout, and eval tooling
are covered by `plugin-dev:skill-development` and `skill-creator`. Read those for how
to fill a field; read this for what to put in it.

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills)
(`writing-for-agents`), MIT, Copyright (c) 2026 Matt Pocock.

## Context pointers

A **context pointer** is a reference held in the agent's context that names material
sitting outside it and encodes the condition for reaching it. A skill's `description`
is one. A line in `CLAUDE.md` naming a doc is the same object.

The pointer's **wording**, not its target, decides whether the agent reaches the
material and how reliably. Must-have material behind a weakly worded pointer is a
variance bug: sharpen the wording first, and inline the material only when sharpening
fails.

A pointer does two jobs: say what the material is, and list the **branches** that
should trigger reaching it. A branch is a distinct case the document handles, so
different runs take different paths through it.

- **Front-load the leading word.** The pointer is where it does its triggering work.
- **One trigger per branch.** Synonyms renaming a single branch are one branch written
  many times: they cost on every turn and buy no extra coverage. Collapse them, keep
  the genuinely distinct branches.
- **Cut identity the body already carries.**

Worked example from this repo: `hook-guard` once listed ten triggers — "set up hooks",
"configure pre-commit", "add linting hooks", "initialize hook-guard", "check hooks",
"hook doctor", "verify hook setup", "troubleshoot hooks", "update hooks", "regenerate
hooks", "sync hooks with current tools". Three branches (set up, diagnose, update)
written ten times.

## The two loads

Every document and pointer spends one of two budgets:

- **Context load** — the cost of always-loaded material on the agent's window: a skill
  description, a `CLAUDE.md` line, anything sitting in context every turn, spending
  tokens and attention whether or not it fires.
- **Cognitive load** — the cost on the human: which documents exist, and when to reach
  for each. The human is the index. Not a cost to minimise; it is the price of human
  agency. Spend it where human judgement matters, remove it where it does not.

Material reached through a pointer escapes context load at the price of the pointer's
own line. Material with no pointer rides entirely on cognitive load.

### Choosing invocation

This is the two loads applied to a skill:

- **Model-invoked** (omit `disable-model-invocation`) keeps a `description`, so the
  agent can fire the skill on its own and other skills can reach it. Typing its name
  still works — model-invocation *includes* user reach. The description is a
  permanently loaded pointer: permanent context load bought for discoverability.
- **User-invoked** (`disable-model-invocation: true`) strips the description from the
  agent's reach: only the human typing the name can invoke it, and no other skill can.
  Zero context load, paid for in cognitive load — you are the index that must remember
  it exists. The `description` becomes human-facing: one line, triggers stripped.

Pick model-invocation when the agent must reach the skill on its own, or another skill
must. A skill that only ever fires by hand should be user-invoked and pay nothing.

Every skill in this repo is currently model-invoked. Treat that as an unexamined
default, not a settled decision: `/obw:init` and this skill are the sort you always
type by hand.

Reference two user-invoked skills both need can live in neither — with no descriptions,
neither can fire the other. Put it in a plain file both can point at, the way this file
sits beside `SKILL.md`.

## Information hierarchy

A document is built from two content types: **steps** (the ordered actions the agent
performs) and **reference** (definitions, rules, and facts consulted on demand). They
mix freely. The decision is where each piece sits on a ladder ranked by how immediately
the agent needs it:

1. **In-file step** — the primary tier: what the agent does, in order.
2. **In-file reference** — consulted on demand. Often a legitimately flat peer-set
   (every rule of a review on one rung). That is a fine arrangement, not a smell.
3. **Disclosed reference** — pushed into a separate file behind a pointer, loaded only
   when the pointer fires. Spans a sibling file through fully external reference.

Push too little down and the top bloats; push too much and you hide material the agent
needs. That tension is the whole decision.

**Progressive disclosure** is the move down the ladder so the top stays legible. Not
primarily a token optimisation: it is how the hierarchy is protected. Branching is the
cleanest test — inline what every branch needs, disclose what only some branches reach.
In a document that has steps, in-file reference that should be disclosed buries them
and turns attending to them into a coin-flip.

**Co-location** is the within-file companion. Where the ladder decides how far down a
piece sits, co-location decides what sits beside it: keep a concept's definition,
rules, and caveats under one heading, so reading one part brings its neighbours along.
The test is whether the document reads like documentation written for the agent.

**Sprawl** is the failure mode: a document simply too long, even when every line is
live and unique. Attention thins across the excess, and every extra line is one more to
keep relevant. The cure is the ladder — disclose reference behind pointers, and split
by branch or sequence so each path carries only what it needs.

## Steps and completion criteria

Every step ends on a **completion criterion**: the condition telling the agent the work
is done. Two properties make it a lever.

- **Clarity** — can the agent tell done from not-done? A vague bound ("understanding
  reached") invites **premature completion**: ending the step early, attention slipping
  to *being done*. The visible steps still ahead supply the pull; the criterion's
  clarity is the resistance. Defend in order: sharpen the bound first, since that is
  local and cheap; only when it is irreducibly fuzzy *and* you observe the rush, split
  the sequence to hide the later steps. Hiding works only across a real context
  boundary — a hand-off or a subagent dispatch. An inline call leaves the later steps
  in context and clears nothing.
- **Demand** — how much the criterion requires. "Every modified model accounted for"
  forces thorough work where "produce a change list" does not. Demand drives the
  legwork the agent does inside the step, and it is not step-bound: "every rule
  applied" binds a body of flat reference just as "every step done" binds a sequence.
  That is how an all-reference document still carries an exhaustiveness bar.

The strongest criteria are both checkable and exhaustive.

## Words

A **leading word** is a compact concept already living in the model's pretraining that
the agent thinks with while running the document — *lesson*, *fog of war*, *tracer
bullet*, *tight*, *red*. Repeated as a token, never as a sentence, it accumulates a
distributed definition and anchors a whole region of behaviour in the fewest tokens, by
recruiting priors the model already holds. Coining your own works when you define it
clearly, but a made-up word recruits no priors: you pay in definition tokens what a
pretrained word gives free. Reach for an existing word first.

It anchors twice. In the body, *execution*: the agent reaches for the same behaviour
every time the word appears. In a pointer, *invocation*: when the same word lives in
your prompts, your docs, and your codebase, the agent links that shared language to the
material and reaches it more reliably.

Hunt for passages that collapse into a single token. "Fast, deterministic,
low-overhead" becomes a *tight* loop. "A loop you believe in" becomes *red*, turning a
fuzzy gate into a binary observable state. You win twice: fewer tokens, and a sharper
hook for the agent to hang its thinking on. Assume every document is carrying
restatements that leading words retire.

**Prompt the positive.** Steering by prohibition drags the forbidden behaviour into
context and makes it *more* available. *Don't think of an elephant*, and the elephant is
all there is; the negation is a weak modifier that the strongly-activated concept
overruns, so the ban half-reads as an instruction to do the thing. State the target
behaviour instead, so the banned one is never spoken. A prohibition earns its place
only as a hard guardrail you cannot phrase positively — and even then, pair it with the
positive target so attention lands on what to do.

## Pruning

- **Single source of truth.** Keep each meaning in one authoritative place, so changing
  the behaviour is a one-place edit. Duplication costs maintenance and tokens, and
  inflates a meaning's prominence past its real rank. (It is the accidental inverse of
  a leading word, which repeats a token on purpose, never the meaning.)
- **The environment is a source of truth too** — `package.json` scripts, config files,
  the directory layout, `--help` output. A document restating it is a **cache**: a copy
  of a lookup, earning its load only when the lookup is expensive. Cache what the agent
  cannot find by looking: the unwritten convention, the reason behind a choice, the
  gotcha no config confesses. Leave one-file, one-command lookups to the environment,
  where they cannot go stale.
- **Relevance.** Does the line still bear on what the document does? A line loses
  relevance by never bearing on the task (mere exposition, or a branch that should be
  disclosed) or by going stale as the world it describes changes. Without pruning, the
  default fate is **sediment**: stale layers that settle because adding feels safe and
  removing feels risky.
- **No-ops.** Hunt sentence by sentence for instructions the model already obeys by
  default — they pay load to say nothing. The test is model-relative, not
  reader-relative: two people disagreeing about a no-op disagree about the default, and
  settle it by running the document, not by debate. When a sentence fails, delete the
  whole sentence rather than trim words from it. The test grades leading words too: a
  word too weak to beat the default (*be thorough*, when the agent is already
  thorough-ish) is a no-op, and the fix is a stronger word (*relentless*), not a
  different technique.
