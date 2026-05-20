# Human Gate Protocol

Loaded by the orchestrator at Phase 2 when reaching the Human Gate.

The gate must give the human enough to judge **without reading research.md or plan.md**. Optimize for **skim-then-decide**: a human glancing for 10 seconds must be able to tell (a) what they're approving, (b) whether any High decisions need their judgment, and (c) what they'll be asked. Detail is one scroll away — but never required to make the call.

Only **High** decisions surface — Medium/Low are the plan agent's call and stay out of the gate. High decisions are either:

- **Strategic direction** — changes success criteria, affects ≥ 2 features, commits product direction, or introduces a new third-party vendor.
- **Irreversible technical** — non-rollback migration, public API break, auth change, removes existing functionality, new data location/format, or vendor lock-in > 1 person-week.

---

## Output Order (strict)

Present the gate in this exact order. Separate every section with a `---` rule so the human can scan section-by-section.

1. **TL;DR** (always)
2. **Gate Header** (always)
3. **Scope Review** (always)
4. **Decisions** (only if High decisions exist)
5. **Before approving — confirm** (always; checklist)
6. **Gate Action** (always; `AskUserQuestion`)

Never reorder. Never collapse sections. Empty Decisions section is omitted entirely (do NOT print "No decisions" — it's noise).

---

## 1. TL;DR (≤ 3 lines)

A single block at the very top so the human sees the shape of the gate before reading anything else.

```
**TL;DR** — Approving {N} user-visible change(s){, with M High decision(s) needing your judgment | (no High decisions — just scope confirmation)}.
**Reversibility**: {one phrase — e.g., "fully reversible", "one irreversible migration", "API break, callers must update"}.
**Recommendation**: {Approve as-is | Approve after confirming decision X | Need your direction on decision Y first}.
```

If `M = 0`, second clause becomes `(no High decisions — just scope confirmation)` and the line is shorter.

---

## 2. Gate Header — Why your review matters here

One short paragraph (≤ 3 sentences) naming the specific risk this gate catches and what we'd default to without input. If you can't articulate it, the gate probably isn't needed.

Example:

> This gate exists because the plan commits us to a non-rollback DB migration. Without your call we'd default to the migration approach in Decision 1, which is harder to undo than the alternatives. The other change (UI copy) is reversible and doesn't need your input — it's listed in Scope only.

---

## 3. Scope Review (always present)

```
### What will change
- **{outcome in plain language}** — Before→After if behavior shifts, scope+reason for fixes
  _Covered by_: {contract name(s)}
- ...

### Why this scope
{one line tying scope to goal; flag anything in the goal NOT covered and why}

### Design assumptions baked in
- **{assumption in user/system terms}** — chosen because {reason}; cost is {what we give up}
- ... (2-4 load-bearing assumptions; skip trivia)
```

Formatting rules:

- One **bold headline** per outcome bullet — readable left-to-right without parsing.
- Group related contracts into one outcome. When grouping, synthesize a single outcome from the grouped `Effect` lines — don't pick one and drop the rest.
- State assumptions in user/system terms ("passwords sync immediately"), not implementation terms ("AuthService calls SyncWorker").
- Keep bullets short — ≤ 1 line where possible. Long evidence belongs in plan.md, not here.

**Downstream-effect rule**: every "What will change" bullet must describe what downstream observers (users, callers, operators) will see differently — not the code-level diff. If you're tempted to write "added X" or "changed Y", reframe as "users can now…" / "callers relying on old behavior will break because…". The human is approving consequences, not edits.

The gate header already covers why scope/assumptions need review — **no per-bullet "Why ask you"**. Per-item "Why ask you" is required only on Decisions (each has a different reason).

---

## 4. Decisions (only if High decisions exist)

Render each High decision as a **numbered card**. Cards are visually identical so the human builds a reading rhythm — same fields in the same order, every time.

```
### Decision {N}: {Title}   [High · {Strategic direction | Irreversible technical}]

**Why ask you**
{one sentence — the judgment only the human can supply}

**Stakes if wrong**
{concrete consequence — e.g., "6-hour rollback window; data written in the new format isn't readable by the old code"}

**Evidence**
- {finding 1} — `path/to/file.ts:L42`
- {finding 2} — `path/to/other.ts:L18`
- (1-3 findings; cite file:line, not vibes)

**Options**

| Option | Upside | Downside | Reversibility |
|---|---|---|---|
| **A. {name}** _(recommended)_ | {one phrase} | {one phrase} | {easy / hard / one-way} |
| B. {name} | {one phrase} | {one phrase} | {easy / hard / one-way} |
| C. {name} | {one phrase} | {one phrase} | {easy / hard / one-way} |

**Recommendation**: **Option A** — {one-sentence rationale tying back to evidence}.
```

Card rules:

- Mark the recommended option directly in the Options table (`_(recommended)_` after the name) AND restate it in the Recommendation line. Redundancy is intentional — the table is skimmed, the line is read.
- If only 1 option is genuinely viable, do NOT pad to 3 — explain why alternatives were ruled out in one line under Evidence ("considered Y but blocked by constraint Z").
- Cards are independent. Number them so the human can refer to them in the Gate Action ("Approve, but switch Decision 2 to Option B").

Medium/Low decisions never appear here. If the orchestrator's High-classification audit (cf.md §Phase 2 Transition Validation step 3) flagged a Medium/Low decision as suspected High, the plan agent should have been re-dispatched — the gate sees only the final classifications.

---

## 5. Before approving — confirm

A short, scannable checklist immediately before the Gate Action so the human has the "what am I being asked to verify" front-of-mind when the question prompt appears.

```
**Before approving, confirm**:
- [ ] Scope matches what you wanted (3 outcomes above)
- [ ] Assumptions are acceptable (2 assumptions above)
- [ ] Decision 1 — you're OK with **Option A** (recommended) _or_ tell me which to switch
- [ ] Decision 2 — same
- (omit decision rows if no High decisions exist)
```

Tailor the line count to the actual gate — if there are no decisions, this block is just the first two rows.

---

## 6. Gate Action

End with one line of totals, then `AskUserQuestion`.

```
**Totals**: {N} outcomes · {K} assumptions · {M} High decision(s)
```

Then call `AskUserQuestion` with these options:

1. **Approve** — proceed to implement as planned.
2. **Approve with one change** — accept scope but switch a decision (free-text which one).
3. **Revise** — describe what to change in scope/decisions; plan re-runs.
4. **Need more research / new direction** — research re-runs with enriched goal.

The "Other" option is added automatically by `AskUserQuestion`. Free-text in any option accepts mixed responses (e.g., "Approve scope but switch Decision 2 to Option C").

---

## Iterative Discussion

The plan phase is a conversation, not one-shot approval. Expect multiple rounds.

- **Conversational clarifications** ("does X mean Y?", "what if…") → answer inline using research evidence; do NOT re-run the plan agent. Doesn't consume loop budget.
- **Concrete revisions** → re-run the plan agent with the revision as added context. Re-present the gate.
- **New possibility from the human**:
  1. Existing research supports it → re-run plan with new direction.
  2. Research didn't explore it → **loop back to research** with the possibility as enriched goal. Tell the human: "needs research first." Cross-phase loop increments.
  3. Never let the plan agent invent a new direction without research evidence.
- **Signs you need research, not just re-plan**: human asks about untouched components/constraints; two consecutive revisions reveal original framing was too narrow; a decision's evidence becomes "we don't know" for the new direction.

On re-presentation after revision, **only re-render the sections that changed** (mark them with `_(updated)_` in the heading). Sections the human already approved last round don't need re-reading — this keeps the loop cost low.

Do NOT proceed to implement without explicit approval.
