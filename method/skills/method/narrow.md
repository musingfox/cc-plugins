# Narrowing a question into a contract

You hold a question, not a contract: nobody has settled what to build. Narrow it, one layer at a time, until it is a contract you can do or split (`split.md`). A question that is already determinate ("how do I implement X") needs no narrowing: go to `split.md`.

Narrowing writes no code. The one exception is a prototype's, which is evidence on its own branch, never merged.

**Contents**

- [The sort](#the-sort)
- [Who decides](#who-decides)
- [Layers and rounds](#layers-and-rounds)
- [1. Diverge](#1-diverge)
- [2. The round](#2-the-round)
- [3. Probe what stays open](#3-probe-what-stays-open)
- [4. Converge](#4-converge)
- [5. The depth gate](#5-the-depth-gate)
- [The end: a contract](#the-end-a-contract)

## The sort

The non-deterministic world holds only **opinions**; the deterministic world holds only **right/wrong**. Sort every question into one before acting on it. A judgment mechanized ("grep for whether this is good") is false rigor. A right/wrong question put to a vote ("does it compile?") lets wrongness survive as an opinion.

Narrowing moves questions from opinion into right/wrong. A **retrievable fact** gets looked up. A **reversible** (two-way door) choice gets a sane default and one line saying you took it. Only a **one-way door** goes to the decision-maker. Escalate by cost to reverse, never exhaustively: every padded question spends the attention the real doors need.

## Who decides

The **decision-maker** owns the picks and the navigation: which direction, when a layer is settled, when to dig a layer deeper, when to go back up. You never pick a direction for them and never start a layer on your own say-so. Dropping a candidate a probe proved wrong is not a pick: right/wrong was never theirs to vote on.

At the top, the decision-maker is the human: ask inline with `AskUserQuestion`, one question per decision plus "Other", at most four per batch. Below the top, it is your author: a round is a `BLOCKED` report, kind decision, each one-way door under Options (`report.md`). Your author answers it by `route.md`, and only a door beyond its authority climbs further.

## Layers and rounds

Each **layer** lands one result, concrete at its own grain and no finer: vague question → approach → milestone → a contract. A layer's result is the seed of the next layer down.

A layer takes as many **rounds** as it needs. A round is one demand on the decision-maker: every decision askable now, asked at once, answered, folded back in. A decision that presupposes another still open belongs to the next round; settling the first is what makes it askable.

Keep two counters, `L` (layer) and `a` (round), starting at `L1-a1`. Write each round's question and answer to a scratch file (`.spiral/L<N>-a<M>-*.md`, gitignored) and overwrite nothing: what was asked and what came back is the **carry-over** that stops the next round repeating the last.

## 1. Diverge

Dispatch `spiral:divergence` (`dispatch.md` "Agent seats"). Divergence is the one seat that must not see your hypotheses, so its dispatch carries only:

- **What to widen from**: the question at `L1-a1`; the previous layer's result at `L<N>-a1`; the same source as `a1` in a later round of the same layer.
- **The carry-over, verbatim**: every direction already rejected at this layer with the feedback on it, and every decision already settled here.

It returns the decisions this layer can settle now, each tagged one-way or two-way door with its distinct candidates, plus the facts it resolved. It describes; it never decides. Pour none of your own direction into the dispatch: steering it destroys the only independence in the loop.

## 2. The round

Put every one-way door from that list in front of the decision-maker at once. Give each two-way door a default instead. One surviving decision is a one-question round; a padded round is worse than a short one.

For each decision: the question in plain language, each candidate's substance inline (what it is, what taking it commits to, how costly it is to undo), and your recommendation with its reason. The recommendation is yours, never Divergence's. Facts Divergence resolved go in as facts. Where the candidates cannot be told apart from their descriptions, invite the decision-maker to keep several alive, and say that keeping several means "go walk them".

Read the answers back:

- **Every decision answered** → step 3. Answers that make new decisions askable do not extend this round; they go to the next layer.
- **Some answered, some blank** → the picks stay settled, the blanks stay open. A blank is not agreement with your recommendation. Round `a+1`, back to step 1 carrying what was settled.
- **Nothing answered, feedback given** → the menu was wrong. Round `a+1`, back to step 1 carrying the feedback.

## 3. Probe what stays open

A decision with one pick is settled. Where several candidates were kept alive, dispatch one `spiral:probe` per live candidate, in parallel. Each gets **one** candidate, what taking it commits to, and what this layer widens from; a probe that sees the others starts comparing. Give no model override: the probe's definition pins its seat, and a cheaper one has returned a false wall.

Sort what the probes bring back:

- **Collided with something hard** → dead by right/wrong. Drop it and record the collision.
- **Still standing** → it survived the walk.
- **Falsified a premise, not the candidate** → the whole menu is re-priced, the unwalked candidates included. Re-price before sorting anything.
- **Reading cannot answer it** → dispatch `spiral:prototype` with the question the build must answer, what counts as red and what as green, the candidate, what this layer widens from, and the branch `spiral/prototype-<question-slug>`. **You draw the red/green line**, concretely enough that the run meets it or does not; a prototype that draws its own can move it. Record the branch it reports back; that branch is the durable evidence.

Then take one exit:

- **One candidate left** → step 4.
- **Two or more left, the difference now an opinion** → round `a+1` asking just that decision, narrowed to the survivors, collisions carried in.
- **Every candidate collided** → round `a+1` carrying the collisions: the menu was wrong.
- **Nothing came back**: no collision, no fact, no build requested → do not ask again. Take your recommendation to step 4 and say the walk could not separate the candidates.
- **The collision is with the result this layer widened from** → nothing here repairs it. Put the ascent to the decision-maker: go back up and retake that decision, or continue at this layer, quoting the upper result beside what the probe found.

## 4. Converge

You write the layer's result: everything settled here narrowed into **one** determinate result. It carries four things:

- **What this layer settles**: the commitment, in one or two sentences.
- **What is concrete enough to build on**: scope, the pieces and how they relate, at this layer's grain.
- **What is left to the next layer**: each choice you deliberately do not make yet, and why it is premature.
- **What would overturn this**: the observation that would make it wrong, and one line per losing direction with what killed it. A result with no falsifier is a preference; say so.

The first and last stand alone: they become acceptance criteria a later reader checks with nothing else. Load-bearing facts carry their source (`path:line`, `git show <branch>:<path>`, a link); what you cannot source is an assumption, named. Resolve sub-choices with a right answer instead of listing them as open. Make the decision-maker's picks determinate, including ones you would have argued against; if they contradict each other, say so and stop.

## 5. The depth gate

Ask the decision-maker one question: enough, or dig another layer. Offer "go back up and retake that decision" only when this layer showed the result above it rests on a false claim, or the frame itself is stuck. Record the answer and its reasoning verbatim on the front of the result.

- **Dig another layer** → `L+1`, round `a1`, step 1, widening from this result and carrying the feedback.
- **Go back up** → `L-1`, reopened, carrying what this layer found.
- **Enough** → the end, below.

Diverge nothing before this answer. A fresh menu put in front of someone ready to stop manufactures the next layer.

## The end: a contract

The narrowing ends where its result is concrete enough to build. Compose the contract from every standing layer: each layer's "settles" and "would overturn" together, plus the deepest layer's "concrete enough to build on" and "left open". Its goal, constraints and decisions taken make the contract; "settles" and "would overturn" are its acceptance criteria. Point at durable artifacts (a spec, an ADR, a commit, a prototype branch) by path; restate what only the scratch files and the conversation hold.

The decision-maker pins it: the human at the top, your author below. Then it is your contract: do it or split it (`split.md`).

Done: a pinned contract, written to a file that outlives the scratch directory, with every acceptance criterion resolvable from that file alone.
