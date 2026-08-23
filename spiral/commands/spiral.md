---
description: "Spiral — narrow a vague question into an implementation-sized goal, one layer at a time: diverge into distinct directions, you pick one, converge it into a plan or milestone, then dig another layer or stop. Produces a goal to hand to /cf; never writes code."
argument-hint: "<the question or vague goal>"
allowed-tools: [Agent, Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral

You drive the **main thread**: dispatch **Divergence** — the one isolated subagent, and the only
thing here that must not see your hypotheses — then converge the picked direction into a plan
yourself, write what the human reads, and stop. You do **not** name directions or pick between
them.

Each round lands one **layer**: a plan or milestone, concrete at that layer's grain and no
finer. The next round diverges from *that plan*, so the spiral descends — vague question →
approach → milestone → an implementation-sized goal. It stops where the human says it is
concrete enough. Spiral never writes code; `/cf` takes it from there.

Concept: `${CLAUDE_PLUGIN_ROOT}/docs/concept.md`. The question is `$ARGUMENTS`.

```bash
mkdir -p .spiral
grep -qxF '.spiral/' .gitignore 2>/dev/null || echo '.spiral/' >> .gitignore
```

**Two counters, and they move independently.** The **layer** `L` deepens only when the human
says 再挖一層; the **attempt** `A` within a layer increments when they reject the menu (都不對).
Start at `L1-a1`. Nothing is ever overwritten — a rejected menu and the reason it was rejected
are the carry-over that keeps the next attempt from repeating it.

## 1 — Diverge

> `Agent(subagent_type: "spiral:divergence", model: "opus")` with **what to widen from** plus
> **every direction already rejected at this layer and the human's feedback on them, verbatim**:
>
> - `L1-a1` → the question itself.
> - `L<N>-a1` (N>1) → the previous layer's plan, `.spiral/L<N-1>-plan.md`.
> - `L<N>-a<M>` (M>1) → the *same* source as `a1` at this layer; there is no plan for this layer
>   yet. What changed is the rejected set, not the artifact.

That carry-over is not optional. The agent has no memory; without it, the next attempt re-lists
the last one, which is the churn this tool exists to avoid. Read prior rounds back from
`.spiral/L*.md` if they have fallen out of your context.

It returns distinct directions, each tagged by cost to reverse (one-way / two-way door), plus
any facts it resolved along the way.

## 2 — The human picks a direction

Write `.spiral/L<N>-a<M>-directions.md` — *you* write this; Divergence returns data, never
human-facing prose. Frontmatter, then the body:

```
---
viz: feedback
title: <the question, or what this layer is deciding, in plain language>
panel: 你的決定
options: <direction A> | <direction B> | <direction C> | 都不對，再想一輪
recommend: <the one you lean to>   # optional
choice:                            # leave empty
notes:                             # leave empty
---
```

The body exists to be read by someone who has not watched the rounds:

- Open with what is actually at stake in plain language — never "round 2" or role names.
- Carry each direction's substance **inline**: what it is, what taking it commits to, how
  expensive it is to undo. Never "see file X" — refs go in a closing footnote.
- Options are the real paths, not spiral's mechanics. No untranslated jargon.
- Facts Divergence resolved go in as facts, not as things to decide.

Render it and read the answer back (§Rendering). Then:
- **A direction** (with or without notes) → step 3.
- **都不對 / feedback with no pick** → same layer, next attempt: `A+1`, back to step 1. The
  rejected file stays on disk untouched — it *is* the carry-over.

## 3 — Converge

**You write** `.spiral/L<N>-plan.md` — narrowing the chosen direction into one determinate
result at this layer. Unlike the widening, this motion wants full context rather than
blindness: the human has already picked, so there is nothing left to be unbiased about.

The result carries four things:

- **What this layer settles** — the commitment, in one or two sentences. Not "we considered X
  and Y"; the thing that is now decided.
- **What is now concrete enough to build on** — the shape a next layer can take as given:
  scope, boundaries, the pieces and how they relate. Concrete at *this* layer's grain, no finer.
- **What is deliberately left to the next layer** — the choices you are consciously not making
  yet, each with why it is premature. This is the seam the next round descends through; an empty
  list means you either over-specified or the layer is actually done.
- **What would overturn this** — the observation that would make it the wrong call, plus one
  line each for the directions that lost. A result with no falsifier is a preference; say so
  rather than dressing it up.

Hold these while writing it:

- **Concrete at this layer, not the next one.** No file lists, no task breakdowns, no code, no
  API signatures — unless *this* layer is explicitly that grain. Over-specifying steals the next
  round's job and forecloses choices nobody made.
- **Resolve, don't punt.** A sub-choice with a right answer gets looked up, not listed as an
  open question. A reversible one gets a sane default and a note — do not hand it back to the
  human. "Left to the next layer" is for what is genuinely premature, never for what you
  couldn't be bothered to settle.
- **Do not re-open the choice.** They already picked; your job is to make that pick determinate,
  not to re-argue it. The rejected rounds sitting in your context are input, not an invitation
  to relitigate — you write the plan for the direction they chose, including the parts you would
  have argued against. If the pick turns out to be internally contradictory, say so in one line
  and stop, rather than silently substituting your own.

## 4 — The human decides whether to dig

The plan is on disk and they can read it. Ask **inline** — `AskUserQuestion`, options
`夠了，就用這個目標` / `再挖一層`, plus the tool's "Other" — carrying a plain-language line on what
the layer settled. No browser render here: §2 is where they weigh substance against substance;
this gate is one binary call on a document they already have, and rendering it again buys
nothing but a round trip.

Then **Edit** their answer onto the front of the plan file — do not rewrite its body, and do not
paraphrase it into a second document:

```
---
spiral: gate
title: <what this layer settled, in plain language>
choice: <夠了，就用這個目標 | 再挖一層>
notes: <their reasoning, verbatim — empty if they gave none>
---
```

Recording it is not optional: on the 再挖一層 path those notes are what the next Divergence
diverges with, and they are the only account of *why* a layer was settled once your context has
rolled over. That block is scaffolding, not content: whoever reads the plan next (the next
layer's Divergence, `/cf`, a human) ignores it.

- **夠了** → report the path. This plan is the deliverable: hand it to `/cf <the goal, one
  line>` with the file as context — it is a **seed**, not a contract set, so `/cf` still runs
  its own research → plan → gate. Keeping the record (move it into the repo, or `/adr`) is the
  other one-liner. Then stop. Executing is not yours.
- **再挖一層** → `L+1`, attempt back to `a1`, and back to step 1 — diverging from *this plan*
  and carrying their notes.

Do **not** dispatch Divergence before this answer. Putting a fresh menu of directions in front
of someone who was ready to stop manufactures the next round — that is the churn, mechanized.

## Rendering

Only §2 renders — it is the one place the human weighs substance against substance. It goes
through two calls:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/render-decision.sh" <file> <name>
```

It ends with `[spiral] save-mode=browser|inline`.
- **`browser`** → hand them the `URL:` line render-decision printed, launch the waiter with the
  Bash tool's `run_in_background`, and end your turn; the human's Save resumes you. Tell them:
  pick + Save, or just type an answer instead. Surfacing the URL is not optional — over SSH
  nothing on this machine can open the browser they are actually looking at.
  ```bash
  bash "${CLAUDE_PLUGIN_ROOT}/scripts/wait-decision.sh" <file>
  ```
- **`inline`** (viz absent / headless) → **AskUserQuestion** with the same options plus "Other".
- **On wake, branch on `choice:`, never on how you woke.** Grep `choice:`/`notes:` from the
  file (`notes:` `\n` is literal — unescape it). `choice:` non-empty → that is the call.
  `choice:` empty with `notes:` filled → they Saved without picking, which is 都不對 *plus* their
  reasoning — the `A+1` path. Never read a no-pick as agreement with `recommend:` — an unpicked
  option was not picked. Both empty → take the typed answer, or ask.
  If you proceed from a typed answer while the waiter may still poll, `TaskStop` it.

## Rules

- **Spiral plans; it does not build.** No code, no gate, no commit. If the question is already
  determinate — "how do I implement X" — say so and point at `/cf`; a settled task does not
  need divergence.
- **One layer per round, and never descend two.** You write the plan at the current grain; the
  next layer is the next round's job. A plan that arrives with file lists and task breakdowns
  skipped a layer nobody approved. Writing it yourself is exactly where this gets tempting —
  you can see the implementation from here, and that is not a reason to put it on the page.
- **The human owns the pick and the stop.** You never choose a direction for them, and you never
  start another round on your own say-so.
- **Keep the Divergence dispatch simple and goal-first** — what to widen from, the carry-over,
  the output shape. Don't pour in your own hypotheses: steering Divergence toward what you expect
  destroys the only thing it is for, and it is now the only isolation left in the loop. If it
  returns one real direction, render one — padding the page to three options to look thorough is
  the failure mode.
- **Files are the source of truth.** Your prose is for the human, not the record.
