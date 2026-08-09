---
description: "Spiral — narrow a vague question into an implementation-sized goal, one layer at a time: diverge into distinct directions, you pick one, converge it into a plan or milestone, then dig another layer or stop. Produces a goal to hand to /cf; never writes code."
argument-hint: "<the question or vague goal>"
allowed-tools: [Agent, Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral

You drive the **main thread**: dispatch the two isolated subagents — **Divergence** names the
directions, **Convergence** turns the picked one into a plan — write what the human reads, and
stop. You do **not** name directions, pick between them, or write the plan yourself.

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

Write `.spiral/L<N>-a<M>-directions.md` — *you* write this; the roles return data, never
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

> `Agent(subagent_type: "spiral:convergence", model: "opus")` with the chosen direction, the
> human's notes, which layer this is, the rounds that led here, and the output path
> `.spiral/L<N>-plan.md`.

It writes the layer's result — what this layer settles, what is now concrete enough to build
on, what it deliberately leaves to the next layer, and what would overturn it.

## 4 — The human decides whether to dig

**Edit** the frontmatter onto the front of the plan file Convergence just wrote — do not rewrite
its body, and do not paraphrase it into a second document:

```
---
viz: feedback
title: <what this layer settled, in plain language>
panel: 這一層夠了嗎
options: 夠了，就用這個目標 | 再挖一層
choice:                            # leave empty
notes:                             # leave empty
---
```

Render it and read the answer back (§Rendering).

- **夠了** → report the path. This plan is the deliverable: hand it to `/cf <the goal, one
  line>` with the file as context — it is a **seed**, not a contract set, so `/cf` still runs
  its own research → plan → gate. Keeping the record (move it into the repo, or `/adr`) is the
  other one-liner. Then stop. Executing is not yours.
- **再挖一層** → `L+1`, attempt back to `a1`, and back to step 1 — diverging from *this plan*
  and carrying their notes.

The plan file keeps its panel frontmatter after Save, so the record also carries the human's
`choice:`/`notes:` — why this layer was settled or dug deeper. That block is scaffolding, not
content: whoever reads the plan next (the next layer's Divergence, `/cf`, a human) ignores it.

Do **not** dispatch Divergence before this answer. Putting a fresh menu of directions in front
of someone who was ready to stop manufactures the next round — that is the churn, mechanized.

## Rendering

Both decision pages go through the same two calls:

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
  `choice:` empty with `notes:` filled → they Saved without picking, which is 都不對 *plus*
  their reasoning. At §2 that is the `A+1` path; §4 has no such branch, so ask them which of its
  two it is, carrying their notes. Never read a no-pick as agreement with `recommend:` — an
  unpicked option was not picked. Both empty → take the typed answer, or ask.
  If you proceed from a typed answer while the waiter may still poll, `TaskStop` it.

## Rules

- **Spiral plans; it does not build.** No code, no gate, no commit. If the question is already
  determinate — "how do I implement X" — say so and point at `/cf`; a settled task does not
  need divergence.
- **One layer per round, and never descend two.** Convergence writes at the current grain; the
  next layer is the next round's job. A plan that arrives with file lists and task breakdowns
  skipped a layer nobody approved.
- **The human owns the pick and the stop.** You never choose a direction for them, and you never
  start another round on your own say-so.
- **Keep each dispatch simple and goal-first** — what to widen from or narrow, the carry-over,
  the output shape. Don't pour in your own hypotheses: steering Divergence toward what you
  expect destroys the only thing it is for. If it returns one real direction, render one —
  padding the page to three options to look thorough is the failure mode.
- **Files are the source of truth.** Your prose is for the human, not the record.
