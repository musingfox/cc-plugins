---
description: "Spiral — narrow a vague question into an implementation-sized goal, one layer at a time: diverge into the decisions a layer can settle, you answer a round of them, probes walk what you left open, converge into a plan or milestone, a prototype builds one throwaway thing when a walk cannot answer it, then dig another layer, go back up, or stop. Produces a goal to hand to /cf; ships no code."
argument-hint: "<the question or vague goal>"
allowed-tools: [Agent, Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral

Two promotion rules — never duplicate a durable artifact, and a suggested-skills section — are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `handoff` (MIT, Copyright (c) 2026 Matt Pocock), commit 3cca18b368ae95cdbdebbff572ccafa662551015. Upstream's temp-directory default is not imported: the promoted milestone is the run's durable result, and the transitional scratch `.spiral/` is already gitignored.

You drive the **main thread**: dispatch **Divergence** — the one thing here that must not see
your hypotheses — dispatch **Probes** to walk whatever the human leaves open, and a **Prototype**
where a walk can only be settled by building the thing, then converge what they settled into a
plan yourself, write what the human reads, and stop. You do **not** name directions or pick
between them.

Each **layer** lands one plan or milestone, concrete at that layer's grain and no finer. The
next layer diverges from *that plan*, so the spiral descends — vague question → approach →
milestone → an implementation-sized goal. It stops where the human says it is concrete enough.
Spiral ships no code — the one thing it ever builds is a throwaway prototype to settle a
decision (§3), abandoned on its own branch. `/cf` takes the goal from there.

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
> - A layer **reopened by an ascent** (§3, §5) → the same source as `a1` at that layer. Its
>   round counter continues past whatever is already on disk there; nothing below it is deleted.

That carry-over is not optional. The agent has no memory; without it, the next round re-lists
the last one, which is the churn this tool exists to avoid. Read prior rounds back from
`.spiral/L*.md` if they have fallen out of your context.

**A reopened layer's carry-over has a different shape**, and getting it wrong makes the reopening
pointless. Carry, verbatim: the claim that was falsified and what falsified it; the superseded
plan; and, of what was settled here, only what did not rest on that claim. A candidate that was
rejected *because of* the false claim is not a rejected candidate any more — it is live again,
and Divergence has to be told which is which, or it will honour the old rejection and hand back
the same menu the falsification was supposed to re-price.

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
d1.recommend: <the one you lean to>
d1.multi: true
d1.choice:
d1.notes:
d2.title: <the next decision>
d2.options: <candidate A> | <candidate B>
d2.choice:
d2.notes:
notes:
---
```

`recommend` and `multi` are optional; the answer keys and the round-level `notes` are written
empty and stay that way until the human saves. **Write no trailing comments** — `#` is not a
comment character here, so `d1.choice:  # leave empty` sets the choice to `# leave empty`, which
§Rendering reads as a settled decision and no rendered card contradicts, because no option label
matches it. A brief written from a commented template is one where every decision arrives
pre-answered with a string nobody chose.

`recommend` is **yours, not Divergence's** — it never saw a recommendation and must not: whoever
authored a menu has already weighted it. Say what you lean to and why in the body, so they can
disagree with a reason rather than a hunch. Do not add a 都不對 option; leaving a decision blank
already says it, and §Rendering reads it that way.

Set **`multi`** on a decision when the candidates cannot honestly be told apart from their
descriptions — the difference is real but only shows up once you walk them. That invites them to
keep several alive, and §3 walks the ones they kept. Do not set it as a courtesy: an invitation
to defer is a cost, and a decision they can settle from the page should be settled from the page.

**`multi` carries one meaning only: "I cannot tell these apart — go walk them."** It never means
"several of these could be taken together". A combination that is itself a live answer is its own
candidate: list `A`, `C`, and `A and C` as three options on an ordinary single-pick decision. Let
the flag carry both meanings and §3 can no longer tell whether it was handed work or an answer.

The body exists to be read by someone who has not watched the layer being built:

- Open with what is actually at stake in plain language — never "round 2" or role names.
- One section per decision, in the same order as the frontmatter, headed by the same question.
- Carry each candidate's substance **inline**: what it is, what taking it commits to, how
  expensive it is to undo. Never "see file X" — refs go in a closing footnote.
- Candidates are the real paths, not spiral's mechanics. No untranslated jargon.
- Facts Divergence resolved go in as facts, not as things to decide.

Render it and read the answers back (§Rendering). Then:

- **Every decision answered** → step 3. Answers that make *new* decisions askable do not extend
  this round; they go into §4's "left to the next layer", and §5's gate is where the human
  decides whether to go get them. A layer never ends because a list ran out (`concept.md` §5),
  and it never continues because one grew.
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
- **Falsified a premise rather than the candidate** → the candidate is not dead; the *menu* is.
  A probe that shows the reason a candidate looked expensive was never true has re-priced every
  candidate that reason touched, including the ones nobody walked. Re-price the whole menu before
  sorting anything: narrowing to "the survivors" is wrong when what fell was the baseline the
  others were measured against.
- **Reading cannot answer it — the thing has to be built and run** → not a collision and not a
  fact, but a request for a different instrument. Send a **Prototype** (below) and re-sort on what
  it brings back. Do not route this to the exits: a probe that ends here brought back a real
  result, and reading it as "nothing came back" retires a live candidate on a technicality.

Then take one of five exits:

- **One candidate left standing** → the probes settled the decision. Go to §4.
- **Two or more left, and the difference between them is now an opinion** → back to §2, `A+1`, a
  round asking just that decision, its candidates narrowed to the survivors and the collisions
  carried in the body. This is the second oscillation at this layer, and it is the only reason to
  put the same decision in front of them twice.
- **Every candidate collided** → the decision has no live answer. Back to §2, `A+1`, carrying the
  collisions — the menu was wrong, and now you know why.
- **The probes brought nothing back** — no collisions, no new facts, and none of them asked for a
  build → do **not** ask again. An oscillation that returns nothing is not a licence to widen
  (`concept.md` §6): take your recommendation to §4 and say in the plan that the walk could not
  separate the candidates.
- **The collision is with the plan this layer widened from** → nothing at this layer can repair
  it, because every candidate here inherits it. Stop and put the ascent to the human — inline,
  `AskUserQuestion`, `退回上一層，重看那個決定` / `就在這一層繼續` plus "Other", quoting the parent
  plan's claim verbatim beside what the probe found. Not §5: there is no plan at this layer yet
  to ask over or to record on, so the answer goes into `.spiral/L<N>-a<M>-probe.md` beside the
  collision that raised it. Going up is the decision-maker's move and no one else's
  (`concept.md` §7), so you offer it and never take it. On 退回上一層, go to §5's ascent branch
  without writing a plan here. Do **not** take `A+1` instead: another round at this layer would
  re-decide on the same false footing.

### When reading is not enough — the Prototype

A probe stops at the first hard thing it can *read*. Where the answer only exists once the thing
runs, that is what a prototype is for — the oscillation's fourth part (`concept.md` §5):

> `Agent(subagent_type: "spiral:prototype", model: "sonnet")` with the **question the build must
> answer**, **what would count as red and what as green**, the candidate or design at stake, the
> artifact this layer widens from, and the branch name `spiral/prototype-<slug>`. The slug comes
> from the question, never from `L<N>`.

**You draw the red/green line, not the prototype.** Running the thing is mechanical; deciding
what result would settle the question is a threshold seam (`concept.md` §2), and a seam the
prototype draws for itself is one it can move until the answer is whatever it built. Say it in
the dispatch, concretely enough that the run either meets it or does not.

One prototype, for one question. You send it on your own say-so, the way you send probes: both
walk a direction the round already chose (`concept.md` §5), and this one simply walks it past
what reading can reach. What it costs is model time, and that is bought by the tier it runs on.

Fold its verdict into `.spiral/L<N>-a<M>-probe.md` beside the probe reports, then re-sort and take
one of the five exits with the verdict in hand.

**Record the branch it reports back** — which may not be the one you handed it, since a same-named
branch from an earlier run makes it pick another. That branch is the only durable thing the
prototype leaves: `.spiral/` dies with the run, so if the verdict is load-bearing for the plan, §4
cites **the branch**, not the probe file (`git show <branch>:verdict.md`). A branch is a source a
later reader can resolve; a scratch path is not.

**A prototype does not make spiral a builder.** Its code is evidence, it lives on a branch nobody
merges, and what comes back is a verdict, not a deliverable. Spiral still ships no code.

## 4 — Converge

**You write** `.spiral/L<N>-plan.md` — narrowing everything they settled at this layer into one
determinate result. Several settled decisions make **one** plan, not one section each: the
result is what they jointly commit to. Unlike the widening, this motion wants full context
rather than blindness: the human has already picked, so there is nothing left to be unbiased
about.

The two-way doors you kept off the page (§2) get resolved here — a sane default and one line
saying you took it, so nothing was decided silently.

**A layer can be converged more than once.** If you are re-converging after an ascent, do not
overwrite `.spiral/L<N>-plan.md`: rename the existing one to `.spiral/L<N>-a<M>-plan.md` for the
round that produced it, write the new plan in its place, and open the new one by naming the claim
that was wrong and correcting it. Do that at this step, not at the ascent itself — a reopened
layer may well confirm what it already had. The superseded plan stays on disk: something that was
acted on for two layers is part of the record, not a draft.

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
- **Load-bearing facts carry their source.** Any claim the result rests on — what a component
  requires, what a file contains, what something costs — cites where it came from: a `path:line`
  for anything in this tree, a `git show <branch>:<path>` for anything a prototype left on a
  branch (§3), a link for anything outside it. What you cannot source goes in as an
  unverified assumption, named as one, with what would settle it. Convergence is the one motion
  here that no independent reader checks: a fact invented at this step is a fact nothing
  downstream will catch, and the layers built on it are built on nothing.
- **Do not re-open their choices.** They already picked; your job is to make those picks
  determinate, not to re-argue them. The rejected menus sitting in your context are input, not an
  invitation to relitigate — you write the plan for the directions they chose, including the
  parts you would have argued against. If their picks turn out to contradict each other, say so
  in one line and stop, rather than silently substituting your own.

## 5 — The human decides whether to dig

The plan is on disk and they can read it. Ask **inline** — `AskUserQuestion`, options
`夠了，就用這個目標` / `再挖一層`, plus the tool's "Other" — carrying a plain-language line on what
the layer settled. Add a third option, `退回上一層，重看那個決定`, only when there is something to
go back for: the plan this layer widened from rests on a claim this layer has shown to be false,
or the frame itself is what is stuck rather than its contents (`concept.md` §7). Offering the ascent on every
gate invites a reframe nobody needed. No browser render here: §2 is where they weigh substance against substance;
this gate is one binary call on a document they already have, and rendering it again buys
nothing but a round trip.

Then **Edit** their answer onto the front of the plan file — do not rewrite its body, and do not
paraphrase it into a second document:

```
---
spiral: gate
title: <what this layer settled, in plain language>
choice: <夠了，就用這個目標 | 再挖一層 | 退回上一層，重看那個決定>
notes: <their reasoning, verbatim — empty if they gave none>
---
```

Recording it is not optional: on the 再挖一層 path those notes are what the next Divergence
diverges with, and they are the only account of *why* a layer was settled once your context has
rolled over. That block is scaffolding, not content: whoever reads the plan next (the next
layer's Divergence, `/cf`, a human) ignores it.

- **夠了** → **promote, then report.** `.spiral/` is scratch — gitignored, and it dies with the
  run. What the run decided is the one thing that must outlive it, so write
  `docs/milestones/<slug>.md` with the milestone frontmatter on the front:

  ```
  ---
  status: accepted    # accepted | done | superseded
  delivered:          # commit or tag ref — filled when acceptance passes
  depends: []         # milestone slugs that must land first
  ---
  ```

  **The milestone is composed from every layer, not copied from the last one.** Its commitment
  and its falsifiers gather the "what this layer settles" and "what would overturn this" of every
  plan still standing — a superseded plan (§4) contributes nothing — because each layer settled
  something the ones below it took as given and never restated. "Concrete enough to build on" and
  "left open" come from the deepest layer alone: those it did restate, and its versions replace
  the upper ones'. Copying `L<N>-plan.md` on its own silently drops most of what the run decided.

  **Never duplicate what a durable artifact already records.** Whatever a spec, plan, ADR,
  issue, commit, or diff already holds is pointed to by path, URL, or commit — the sourcing §4
  demands — never re-copied into the milestone. `.spiral/` and the conversation are not durable
  artifacts: what only they hold, the milestone must restate.

  **A `## Suggested skills` section in the body, from the deepest layer alone.** It names the
  skills the next agent should invoke, one line each on why — the same source as "concrete enough
  to build on"; upper layers contribute nothing. `none` is a valid entry and omitting the section
  is not: the next reader cannot tell a considered nothing from a forgotten one.

  The slug comes from what the run settled, never from `L<N>` — that counter is run-local and
  collides across runs. `status: done` with an empty `delivered:` is a claim with no receipt;
  the two move together.

  The promoted file is the deliverable: hand it to `/cf <the goal, one line>` with the file as
  context — it is a **seed**, not a contract set, so `/cf` still runs its own research → plan →
  gate. Then stop. Executing is not yours.
- **再挖一層** → `L+1`, round back to `a1`, and back to step 1 — diverging from *this plan*
  and carrying their notes.
- **退回上一層** → `L-1`, reopened, and back to step 1 with the carry-over §1 describes for that
  case. The round counter at that layer continues past whatever is already on disk there; nothing
  is deleted. Everything from the reopened layer downward **stops standing**: its plan is renamed
  per §4 when that layer is re-converged, and the plans below it — built on the claim that
  fell — contribute nothing to promotion until they are re-earned. Say that plainly rather than
  quietly leaving them in `.spiral/` for a later step to gather.

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

  **A timeout (exit 2) is not an answer and not a failure.** Nothing was saved, the page is still
  open, and the brief is untouched. Say exactly that, re-arm the waiter on the same file, and end
  your turn again. Ending the turn silently is what makes the timeout look like the run died,
  which is the one reading that is certainly wrong; treating it as 都不對 is worse still, because
  it manufactures a round out of someone being away from their desk.
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

- **Spiral plans; it ships no code.** No gate, no deliverable, nothing merged. If the question is
  already determinate — "how do I implement X" — say so and point at `/cf`; a settled task does
  not need divergence. The one place code gets written is a prototype (§3): that code is evidence
  for a decision, it is built in its own worktree, and it is abandoned on a branch. You yourself
  never write code at any depth.
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
