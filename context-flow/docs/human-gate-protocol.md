# Human Gate Protocol

Loaded by the orchestrator at Phase 2 when reaching the Human Gate.

The gate must give the human enough to judge **without reading research.md or plan.md**. Always present Scope Review; add Decisions when High/Medium ones exist. Prioritize irreversible / architectural choices — easily reversible items belong in Low impact and skip the gate.

## 1. Gate Header — Why your review matters here

One short paragraph naming the specific risk this gate catches and what we'd default to without input. If you can't articulate it, the gate probably isn't needed.

## 2. Scope Review (always present)

```
**What will change** (one bullet per user-visible outcome; group related contracts):
- **{outcome in plain language}** — Before→After if behavior shifts, scope+reason for fixes
  _(covered by: {contract name(s)})_

**Why this scope**: {one line tying scope to goal; flag anything in the goal NOT covered and why}

**Design assumptions baked in**:
- {assumption in user/system terms} — chosen because {reason}; cost is {what we give up}
  (2-4 load-bearing assumptions; skip trivia)

**Checklist**: scope match? assumptions OK? test coverage adequate?
```

When grouping contracts into one outcome bullet, synthesize a single outcome from the grouped `Effect` lines — don't pick one and drop the rest. State assumptions in user/system terms ("passwords sync immediately"), not implementation terms.

**Downstream-effect rule**: every "What will change" bullet must describe what downstream observers (users, callers, operators) will see differently — not the code-level diff. If you're tempted to write "added X" or "changed Y", reframe as "users can now…" / "callers relying on old behavior will break because…". The human is approving consequences, not edits.

The gate header already covers why scope/assumptions need review — **no per-bullet "Why ask you"**. Per-item "Why ask you" is required only on Decisions (each has a different reason).

## 3. Decisions (only for High/Medium)

```
**[Impact] {Title}**
**Why ask you**: {one sentence — the judgment only the human can supply}
**Stakes**: concrete consequences if wrong; what becomes hard to change later
**Evidence**: 1-3 research findings (with file paths) that constrain the choice

**Options** (table): Approach | Upside | Downside | Reversibility — per option
{Optional: extra observation that doesn't fit the dimensions}
**Recommendation**: which option, referencing evidence
```

For auto-upgraded decisions, prefix `[High ↑ auto-upgraded from Medium]` and note the rule that triggered it.

## 4. Gate Action

End with totals (scope, change surface, decisions count), then `AskUserQuestion` with 4 options: "Approve", "Revise (describe changes)", "Need more research / new direction", "Other". Revise/Other branches accept mixed free-text responses (e.g., approve scope but change one decision).

## 5. Iterative Discussion

The plan phase is a conversation, not one-shot approval. Expect multiple rounds.

- **Conversational clarifications** ("does X mean Y?", "what if…") → answer inline using research evidence; do NOT re-run the plan agent. Doesn't consume loop budget.
- **Concrete revisions** → re-run the plan agent with the revision as added context. Re-present the gate.
- **New possibility from the human**:
  1. Existing research supports it → re-run plan with new direction.
  2. Research didn't explore it → **loop back to research** with the possibility as enriched goal. Tell the human: "needs research first." Cross-phase loop increments.
  3. Never let the plan agent invent a new direction without research evidence.
- **Signs you need research, not just re-plan**: human asks about untouched components/constraints; two consecutive revisions reveal original framing was too narrow; a decision's evidence becomes "we don't know" for the new direction.

Do NOT proceed to implement without explicit approval.
