---
description: "Spiral — narrow a vague question into an implementation-sized goal, one layer at a time: diverge into distinct directions, you pick one, converge it into a plan or milestone, then dig another layer or stop. Produces a goal to hand to /cf; never writes code."
argument-hint: "<the question or vague goal>"
allowed-tools: [Agent, Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral

You drive the **main thread**: dispatch **Divergence** — the one thing here that must not see
your hypotheses — dispatch **Probes** to walk whatever the human leaves open, then converge what
they settled into a plan yourself, write what the human reads, and stop. You do **not** name
directions or pick between them.

Each **layer** lands one plan or milestone, concrete at that layer's grain and no finer. The
next layer diverges from *that plan*, so the spiral descends — vague question → approach →
milestone → an implementation-sized goal. It stops where the human says it is concrete enough.
Spiral never writes code; `/cf` takes it from there.

A layer takes as many **rounds** as it needs. A round is one demand on the human's attention:
every decision that is askable now, asked at once, answered, and folded back in — which is what
makes the next ones askable. `concept.md` §5 defines the term; this file just runs it.

Concept: `${CLAUDE_PLUGIN_ROOT}/docs/concept.md`. The question is `$ARGUMENTS`.

```bash
mkdir -p .spiral
grep -qxF '.spiral/' .gitignore 2>/dev/null || echo '.spiral/' >> .gitignore
```

**Two counters, and they move independently.** The **layer** `L` deepens only when the human
says 再挖一層; the **round** `A` within a layer increments whenever the layer is not settled yet —
they rejected the menu (都不對), or they answered some decisions and left others blank. Start at
`L1-a1`. Nothing is ever overwritten — what was asked and what came back are the carry-over that
keeps the next round from repeating it.

## 1 — Diverge

> `Agent(subagent_type: "spiral:divergence", model: "opus")` with **what to widen from** plus
> the carry-over for this layer, **verbatim**: every direction already rejected and the human's
> feedback on it, and every decision they have already settled here.
>
> - `L1-a1` → the question itself.
> - `L<N>-a1` (N>1) → the previous layer's plan, `.spiral/L<N-1>-plan.md`.
> - `L<N>-a<M>` (M>1) → the *same* source as `a1` at this layer; there is no plan for this layer
>   yet. What changed is the rejected set and what they settled, not the artifact.

That carry-over is not optional. The agent has no memory; without it, the next round re-lists
the last one, which is the churn this tool exists to avoid. Read prior rounds back from
`.spiral/L*.md` if they have fallen out of your context.

It returns **the decisions this layer can settle now** — every one whose prerequisites are
already resolved — each tagged by cost to reverse (one-way / two-way door) and carrying its
distinct candidates, plus any facts it resolved along the way. A decision that presupposes
another in the same set is not in this round; settling that one is what makes it askable.

## 2 — The human answers the round

Write `.spiral/L<N>-a<M>-directions.md` — *you* write this; Divergence returns data, never
human-facing prose.

**One round asks every decision that is askable now, and only the one-way doors.** A two-way
door is cheap to undo: give it a sane default in §4 and one line in the plan saying you took it.
Putting it on the page spends the attention the real doors need. If only one decision survives
that filter, the round is one question — a padded page is worse than a short one.

Frontmatter carries one block per decision, in reading order; `d1`, `d2`, … are yours and mean
nothing beyond order:

```
---
viz: feedback
title: <what this layer is deciding, in plain language>
panel: 你的決定
prompt: 這幾題彼此獨立，可以分開回答；沒把握的留白，下一輪再問。
d1.title: <the decision, phrased as a question>
d1.options: <candidate A> | <candidate B> | <candidate C>
d1.recommend: <the one you lean to>   # optional
d1.multi: true                        # optional — they may keep several alive; see §3
d1.choice:                            # leave empty
d1.notes:                             # leave empty
d2.title: <the next decision>
d2.options: <candidate A> | <candidate B>
d2.choice:
d2.notes:
notes:                                # leave empty — round-level remarks
---
```

`recommend` is **yours, not Divergence's** — it never saw a recommendation and must not: whoever
authored a menu has already weighted it. Say what you lean to and why in the body, so they can
disagree with a reason rather than a hunch. Do not add a 都不對 option; leaving a decision blank
already says it, and §Rendering reads it that way.

Set **`multi`** on a decision when the candidates cannot honestly be told apart from their
descriptions — the difference is real but only shows up once you walk them. That invites them to
keep several alive, and §3 walks the ones they kept. Do not set it as a courtesy: an invitation
to defer is a cost, and a decision they can settle from the page should be settled from the page.

The body exists to be read by someone who has not watched the layer being built:

- Open with what is actually at stake in plain language — never "round 2" or role names.
- One section per decision, in the same order as the frontmatter, headed by the same question.
- Carry each candidate's substance **inline**: what it is, what taking it commits to, how
  expensive it is to undo. Never "see file X" — refs go in a closing footnote.
- Candidates are the real paths, not spiral's mechanics. No untranslated jargon.
- Facts Divergence resolved go in as facts, not as things to decide.

Render it and read the answers back (§Rendering). Then:

- **Every decision answered** → step 3.
- **Some answered, some blank** → the picks are settled and stay settled; the blanks are not.
  `A+1`, back to step 1 carrying the settled ones. This is not a retry: settling some decisions
  is exactly what makes the next ones askable, so the next round is a *different* round.
- **Nothing answered, notes given** → 都不對. `A+1`, back to step 1 with their reasoning.

The answered file stays on disk untouched — it *is* the carry-over.

## 3 — Probe what they left open

A decision that came back with **one** pick is settled; there is nothing to walk. If no decision
came back with more than one, skip straight to §4 — that is exactly the old behaviour, unchanged.

Where they kept several candidates alive, walk them. **One probe per live candidate, dispatched
in parallel in a single message:**

> `Agent(subagent_type: "spiral:probe", model: "sonnet")` with **one** candidate, what taking it
> would commit to, and the artifact this layer widens from. Nothing else — a probe that can see
> the other candidates starts comparing, and comparing is not its job.

Cheap models, as many as there are candidates. What a probe reports — what a path actually runs
into — has a right answer, so it is mechanism work and deserves little judgment however many run
at once (`concept.md` §2). Walking them at main-thread cost is what would make this unaffordable.

Collect the reports into `.spiral/L<N>-a<M>-probe.md`, one section per candidate, complete enough
that the collisions survive your context rolling over. Then sort them:

- **Collided with something hard** → dead by right/wrong. Drop it and record the collision. This
  does not go back to the human: a fact is nobody's vote (`concept.md` §4).
- **Still standing** → it survived the walk.

Then take one of four exits:

- **One candidate left standing** → the probes settled the decision. Go to §4.
- **Two or more left, and the difference between them is now an opinion** → back to §2, `A+1`, a
  round asking just that decision, its candidates narrowed to the survivors and the collisions
  carried in the body. This is the second oscillation at this layer, and it is the only reason to
  put the same decision in front of them twice.
- **Every candidate collided** → the decision has no live answer. Back to §2, `A+1`, carrying the
  collisions — the menu was wrong, and now you know why.
- **The probes brought nothing back** — no collisions, no new facts → do **not** ask again. An
  oscillation that returns nothing is not a licence to widen (`concept.md` §6): take your
  recommendation to §4 and say in the plan that the walk could not separate the candidates.

If a probe reports that the only way to answer is to build or run the thing, that is not
spiral's job. Say so and offer the handoff: spiral writes no code at any depth, and a throwaway
walk is still a walk, not a prototype.

## 4 — Converge

**You write** `.spiral/L<N>-plan.md` — narrowing everything they settled at this layer into one
determinate result. Several settled decisions make **one** plan, not one section each: the
result is what they jointly commit to. Unlike the widening, this motion wants full context
rather than blindness: the human has already picked, so there is nothing left to be unbiased
about.

The two-way doors you kept off the page (§2) get resolved here — a sane default and one line
saying you took it, so nothing was decided silently.

Where §3 walked candidates, the collisions are part of the result, not background. A candidate
the probes killed belongs in the falsifier section with what it hit; a decision the probes
settled is settled on evidence, and the plan should say so rather than presenting it as a
preference. **Do not re-open a decision the probes closed** — a wall is a fact, and arguing with
it here is the same mistake as putting it to a vote.

The result carries four things:

- **What this layer settles** — the commitment, in one or two sentences. Not "we considered X
  and Y"; the thing that is now decided.
- **What is now concrete enough to build on** — the shape a next layer can take as given:
  scope, boundaries, the pieces and how they relate. Concrete at *this* layer's grain, no finer.
- **What is deliberately left to the next layer** — the choices you are consciously not making
  yet, each with why it is premature. This is the seam the next layer descends through; an empty
  list means you either over-specified or the layer is actually done.
- **What would overturn this** — the observation that would make it the wrong call, plus one
  line each for the directions that lost. A result with no falsifier is a preference; say so
  rather than dressing it up.

**The first and last sections must stand alone.** Once this plan is promoted (§5) they are the
acceptance criteria a later verifier reads — with the plan file and nothing else. No "see the
conversation", no `.spiral/` paths: those die with the run, and a criterion nobody can resolve
is a criterion nobody can check.

Hold these while writing it:

- **Concrete at this layer, not the next one.** No file lists, no task breakdowns, no code, no
  API signatures — unless *this* layer is explicitly that grain. Over-specifying steals the next
  layer's job and forecloses choices nobody made.
- **Resolve, don't punt.** A sub-choice with a right answer gets looked up, not listed as an
  open question. A reversible one gets a sane default and a note — do not hand it back to the
  human. "Left to the next layer" is for what is genuinely premature, never for what you
  couldn't be bothered to settle.
- **Do not re-open their choices.** They already picked; your job is to make those picks
  determinate, not to re-argue them. The rejected menus sitting in your context are input, not an
  invitation to relitigate — you write the plan for the directions they chose, including the
  parts you would have argued against. If their picks turn out to contradict each other, say so
  in one line and stop, rather than silently substituting your own.

## 5 — The human decides whether to dig

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

- **夠了** → **promote the plan, then report.** `.spiral/` is scratch — gitignored, and it dies
  with the run. This plan is the one thing here that must outlive it, so copy it to
  `docs/milestones/<slug>.md` and put the milestone frontmatter on the front:

  ```
  ---
  status: accepted    # accepted | done | superseded
  delivered:          # commit or tag ref — filled when acceptance passes
  depends: []         # milestone slugs that must land first
  ---
  ```

  The slug comes from what the layer settled, never from `L<N>` — that counter is run-local and
  collides across runs. `status: done` with an empty `delivered:` is a claim with no receipt;
  the two move together.

  The promoted file is the deliverable: hand it to `/cf <the goal, one line>` with the file as
  context — it is a **seed**, not a contract set, so `/cf` still runs its own research → plan →
  gate. Then stop. Executing is not yours.
- **再挖一層** → `L+1`, round back to `a1`, and back to step 1 — diverging from *this plan*
  and carrying their notes.

Do **not** dispatch Divergence before this answer. Putting a fresh menu of directions in front
of someone who was ready to stop manufactures the next layer — that is the churn, mechanized.

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
  The waiter wakes on the Save itself, not on the round being complete — a partly answered round
  is a legitimate answer (§2), and reading it is your job, not the waiter's.
- **`inline`** (viz absent / headless) → **AskUserQuestion**, one question per decision plus
  "Other". It caps at four; a wider round goes in batches, and a batch that comes back changing
  what the later ones should ask is a new round, not a continuation.
- **On wake, branch on what is in the file, never on how you woke.** Grep every
  `<id>.choice:` / `<id>.notes:` and the round-level `notes:` (`\n` in a notes value is literal —
  unescape it). A decision with a non-empty `choice` is settled. One left empty is **not** — never
  read a blank as agreement with `recommend:`, an unpicked option was not picked. Then take the
  §2 branch: all settled → §3; some settled → `A+1` carrying them; none settled → 都不對.
  Every answer key empty and no `notes:` → take the typed answer, or ask.
  If you proceed from a typed answer while the waiter may still poll, `TaskStop` it.

## Rules

- **Spiral plans; it does not build.** No code, no gate, no commit. If the question is already
  determinate — "how do I implement X" — say so and point at `/cf`; a settled task does not
  need divergence.
- **One layer at a time, and never descend two.** You write the plan at the current grain; the
  next layer is the next pass's job. A plan that arrives with file lists and task breakdowns
  skipped a layer nobody approved. Writing it yourself is exactly where this gets tempting —
  you can see the implementation from here, and that is not a reason to put it on the page.
- **The human owns the picks and the stop.** You never choose a direction for them, and you never
  start another layer on your own say-so. Dropping a candidate a probe found a wall in is not a
  pick — it was shown to be wrong, and right/wrong was never theirs to vote on.
- **Keep the Divergence dispatch simple and goal-first** — what to widen from, the carry-over,
  the output shape. Don't pour in your own hypotheses: steering Divergence toward what you expect
  destroys the only thing it is for, and it is now the only isolation left in the loop. If it
  returns one real decision with two candidates, render exactly that — padding the page to look
  thorough is the failure mode.
- **Files are the source of truth.** Your prose is for the human, not the record.
