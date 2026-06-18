---
description: "Spiral→cf handoff (manual pilot) — distill a converged spiral run into a contract baton document, gate it with the human, then print the /cf execution prompt and the acceptance step"
argument-hint: "[output path (default: docs/handoff-<goal-slug>.md)]"
allowed-tools: [Read, Write, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral → CF Handoff

You are turning a **converged** spiral exploration into an execution baton for context-flow.
This is the manual pilot of the spiral→cf ramp: precondition first, distill second, human
gate third, guide last — and collect format-gap notes along the way (they are the design
input for automating this ramp later).

## 1. Precondition — is this run actually handoff-ready?

Read the state: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/state.sh" get`.

- No `.spiral/state.json` → stop: nothing to hand off.
- Handoff-ready means the territory is **known**: the latest Divergence verdict is goal-met,
  or the remaining seeds are purely mechanical (contracts can be written without guessing).
- Open unknowns or ship-blocking holes → report them and stop. That work still belongs to
  spiral; a baton written over unknown territory is a lying contract.

## 2. Distill the baton — no new analysis

Sources: `.spiral/state.json` (goal, goal_history, examples, accepted_holes, feedback_log,
per-turn verdicts), `.spiral/decision-turn-*.md`, the analysis docs the run produced (check
the run's `spiral(turn N)` commits), and any repo docs they cite.

Write the baton to `$ARGUMENTS` (default `docs/handoff-<goal-slug>.md`), in English,
with exactly four sections:

1. **Frozen direction & rationale** — what was decided, and the evidence that froze it.
2. **Behavioral contracts** — each with a mechanically verifiable handle (what a test or
   gate can check). These become cf's plan input.
3. **Holes ledger** — accepted/parkable holes and known boundaries that carry over, each
   tagged with what would close it.
4. **Unverified assumptions** — explicitly flagged. cf must treat these as tripwires, not
   facts.

Distill validated conclusions only — invent nothing, re-analyze nothing. If a section
cannot be filled from the run's record, that is a precondition failure (go back to step 1's
verdict), not a license to improvise.

## 3. Human gate

Present a compact summary (direction, contract count, holes count, assumption count, file
path) and ask via AskUserQuestion: **approve / edit / abort**. The human owns the handoff —
do not proceed to step 4 on your own judgment.

## 4. Guide the execution — print, don't run

On approval, print the two follow-up actions for the human (do not invoke them yourself):

**a. The cf prompt** (run in this project's session):

> `/cf` implement per `<baton path>`. The contracts are pre-validated by a spiral run:
> plan does **gap-scan** (areas execution touches that the exploration never read) and
> **shard mapping** only — do not redo feasibility analysis. If implementation finds any
> contract contradicted by reality, **stop and report that contract**; never work around it.

**b. The acceptance step** (after cf completes — close the V):

> First, a mechanical **structural coverage** pre-check — main thread, no new human gate:
> confirm `{frozen Examples} ⊆ {cf plan test cases}` and `{carried accepted_holes} ⊆ {plan
> dispositions}`. Output is binary **covered / not-covered** — necessary, not sufficient,
> and NOT a quality or fitness verdict (behavioral fitness is divergence's alone). On
> not-covered, report the gap before dispatching divergence.
>
> Then dispatch `spiral:divergence` (opus) with the **original goal + frozen Examples** from
> `.spiral/state.json` — never cf's contracts or notes — judging the merged result.
> Reality over fixtures: exercise the real flow before the verdict.
>
> When the verdict returns, **parse the `door-class re-evaluated` line for every carried
> `accepted_hole`**: each suppressed carried hole MUST carry an explicit `unchanged | changed
> + evidence` line. A carried hole that divergence neither re-opened nor annotated is a
> contract violation — surface it and treat the verdict as incomplete, not a clean pass
> (suppression by silence is not accepted). A `changed` line re-opens that hole as ship-blocking.
>
> Then reconcile holes via `state.sh` (closed → remove with a note; new parkables → append)
> and log the milestone to `feedback_log`.

**c. The cf re-dispatch** (only on the divergence route *"a contract is correct but unmet"* —
same baton, new attempt). Before re-pasting the §4a cf prompt, refresh the baton so cf reads
the current holes — main-orchestrator action, print-don't-run:

> 1. Read the live holes: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/state.sh" get '.accepted_holes'`.
> 2. Rewrite the baton's **Holes ledger** section (§2 item 3) with that array. `.spiral/state.json`
>    is the single source of truth; the ledger is a **regenerated view**, not a frozen turn-1
>    snapshot — re-render it on every re-dispatch so cf never re-plans against a stale list.
> 3. Re-paste the §4a cf prompt unchanged.

This is the defect-4 re-entry leg. handoff.md prints it; the main thread runs it. handoff.md
never dispatches cf and never loops on its own — the fresh-handoff path renders the ledger once
at distillation (§2); this step re-renders it. The route that selects this branch is decided in
§4b by the divergence verdict, not by handoff.md.

## 5. Pilot notes

Create or append `.spiral/handoff-pilot-notes.md`: anything the baton turned out to lack,
anything cf had to ask for, anything acceptance needed that wasn't carried. These notes are
the spec for automating this ramp — they matter as much as the baton itself.
