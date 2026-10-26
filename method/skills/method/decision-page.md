# The decision page

At the top the decision-maker is the human, and a round is easier to weigh on a page than in a terminal: candidates side by side, what each costs to undo, the detail one click away. This file is how a round (`narrow.md` step 2) or the depth gate (step 5) goes onto that page and how its answers come back. Below the top there is no page: a round is a `BLOCKED` report.

**Contents**

- [The brief](#the-brief)
- [The body](#the-body)
- [Render and wait](#render-and-wait)
- [Reading the answers back](#reading-the-answers-back)
- [The depth gate on the page](#the-depth-gate-on-the-page)

## The brief

Write the round to `.narrow/L<N>-a<M>-directions.md` yourself: Divergence returns data, never prose a human reads.

One round asks every one-way door that is askable now, and only those. A two-way door gets a default and one line saying you took it; putting it on the page spends the attention the real doors need. If one decision survives, the round is one question.

The frontmatter carries one block per decision, in reading order. `d1`, `d2`, … are yours and mean nothing beyond order:

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

`recommend` and `multi` are optional. The answer keys and the round-level `notes` are written empty and stay empty until the human saves. **Write no trailing comments**: `#` is not a comment character here, so `d1.choice:  # leave empty` sets the choice to `# leave empty`, which reads back as a settled decision no option label matches. A brief written from a commented template is one where every decision arrives pre-answered with a string nobody chose.

`recommend` is yours, never Divergence's: it never saw a recommendation and must not, because whoever authored a menu has already weighted it. Say what you lean to and why in the body, so the human can disagree with a reason rather than a hunch. Add no "none of these" option; leaving a decision blank already says it.

Set `multi` on a decision when the candidates cannot honestly be told apart from their descriptions: the difference is real but only shows once you walk them. It invites the human to keep several alive, and step 3 walks the ones kept. Do not set it as a courtesy; an invitation to defer is a cost. **`multi` carries one meaning only: "I cannot tell these apart, go walk them."** It never means "several of these could be taken together". A combination that is itself a live answer is its own candidate: list `A`, `C` and `A and C` as three options on an ordinary single-pick decision. Let the flag carry both meanings and step 3 can no longer tell whether it was handed work or an answer.

## The body

The body is read by someone who has not watched the layer being built:

- Open with what is at stake in plain language, one or two sentences. Never "round 2" or a seat's name.
- One section per decision, in the frontmatter's order, headed by the same question.
- Carry each candidate's substance **inline**: what it is, what taking it commits to, how expensive it is to undo. Never "see file X"; references go in a closing footnote.
- Candidates are the real paths, not the method's mechanics. No untranslated jargon.
- Facts Divergence resolved go in as facts, not as things to decide.

Lay it out to be scanned, not read through. The page opens on a card view projected from this structure, with the markdown one click away as 原文, so write the structure exactly; a section that does not match is shown as plain text, not lost:

- **Compare candidates in one table**, a row per candidate and columns 好處 / 代價 / 改回成本. The first cell of each row is the candidate's label exactly as written in `dN.options`: that is how a row becomes its card, so no numbering and no shortening. Cells are short phrases joined by `；`. 改回成本 is a single word (高 / 中高 / 中 / 中低 / 低); when it is 高, bold it and add a clause after `：` naming what makes it one-way, because on a one-way door that reason is the fact the reader decides on. Never give each candidate its own paragraph of pros and cons.
- **Move detail, never drop it.** A candidate's full account (what it is, the numbers, the counter-examples that did not fit a cell) goes in a `### <label>` subsection after the recommendation, headed by the same exact label; it becomes that card's detail. Evidence that belongs to no single candidate goes in a short paragraph under the table or in the footnote.
- **Put the recommendation in a blockquote after the table**: the pick in bold, then at most two sentences of why, carrying the one number that decides it.
- **Draw the candidates when they differ by where or when something happens**: a stage of a pipeline, a step of a sequence, a layer of the stack. A small Mermaid flowchart with each candidate hung on its spot, the recommended one styled with a `classDef`, shows at a glance what the table has to spell out.
- **Resolved facts go in a table too** (發現 / 證據 / 後果) when there are three or more; each cell is one clause, with the number in the evidence column. A fact needing more than a cell gets a `### <發現>` subsection under the table, headed by that row's first cell.

## Render and wait

Two calls, from the plugin root SKILL.md names:

```bash
bash <plugin root>/scripts/render-decision.sh <brief> <name>
```

It ends with `[method] save-mode=browser|inline`. It refuses a brief that has any answer key already filled, or a table row whose first cell is not one of its decision's options: it exits 1 with `[method] brief rejected:` and one line per problem, and renders nothing. Fix what it names and render again.

- **`browser`**: hand the human the `URL:` line render-decision printed, launch the waiter with the Bash tool's `run_in_background`, and end your turn; the human's Save resumes you. Tell them: pick and Save, or just type an answer instead. Surfacing the URL is not optional: over SSH nothing on this machine can open the browser they are actually looking at.

  ```bash
  bash <plugin root>/scripts/wait-decision.sh <brief>
  ```

  The waiter wakes on the Save itself, not on the round being complete. A partly answered round is a legitimate answer, and reading it is your job, not the waiter's.

  **A timeout (exit 2) is not an answer and not a failure.** Nothing was saved, the page is still open, the brief is untouched. Say exactly that, re-arm the waiter on the same file, and end your turn again. Ending the turn silently makes the timeout look like the run died, which is certainly the wrong reading; treating it as "nothing is right" is worse, because it manufactures a round out of someone being away from their desk.
- **`inline`** (viz absent or headless): ask with `AskUserQuestion`, one question per decision plus "Other". It caps at four; a wider round goes in batches, and a batch that comes back changing what the later ones should ask is a new round, not a continuation.

## Reading the answers back

On wake, branch on what is in the file, never on how you woke. Grep every `<id>.choice:` and `<id>.notes:` and the round-level `notes:`; `\n` in a notes value is literal, so unescape it.

- A decision with a non-empty `choice` is settled.
- One left empty is not settled. Never read a blank as agreement with `recommend:`: an unpicked option was not picked.
- Then take `narrow.md` step 2's branch: every decision settled → step 3; some settled → round `a+1` carrying them; none settled but notes given → round `a+1` with the notes.
- Every answer key empty and no `notes:` → take the typed answer, or ask.
- If you proceed from a typed answer while the waiter may still poll, `TaskStop` it.

The answered file stays on disk untouched: it is the carry-over.

## The depth gate on the page

The gate is a round of one decision. Write the same brief with a single `d1`: `d1.title` asks whether this layer is enough, `d1.options` are `enough` and `dig another layer`, plus `go back up and retake that decision` only when `narrow.md` step 5 allows it. The body is a plain-language line on what the layer settled; it needs no comparison table. Render, wait and read it back as above, then record the answer on the front of the result as step 5 says.
