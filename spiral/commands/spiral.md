---
description: "Spiral — run one turn of converge → deterministic gate → independent diverge → human decision, then loop or stop. Two roles run as isolated subagents; the human is the decision-maker."
argument-hint: "<vague goal>"
allowed-tools: [Agent, Read, Write, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral Orchestrator

You drive the **main thread** — the decision-maker's seat. The two roles run as isolated
subagents (fresh context each time, so Divergence cannot see how Convergence built); the
deterministic gate runs as a commit hook (the machine, not you, judges right/wrong); the
human owns the criteria and the STOP. Your job is to advance the turn and surface the
decisions, not to make the judgments yourself.

Concept: `${CLAUDE_PLUGIN_ROOT}/docs/concept.md`. The goal for this run is `$ARGUMENTS`.

## Setup (once)

```bash
mkdir -p .spiral
grep -qxF '.spiral/' .gitignore 2>/dev/null || echo '.spiral/' >> .gitignore
```

Read `.spiral/state.json` if it exists (carries `goal`, `turn`, `examples`, `gate_cmd`,
`accepted_holes`, `feedback_log`). If absent, this is turn 1 with seed = `$ARGUMENTS`.

---

## One turn

### 1 — Converge: FORMALIZE

Invoke the Convergence role to formalize the seed:

> `Agent(subagent_type: "spiral:convergence")` with a task beginning `FORMALIZE:` then the
> current seed and any `accepted_holes` from prior turns (these become required gate checks).

It returns a VERDICT, EXAMPLES (each with a verifiable handle), and a GATE_CMD.

- If `VERDICT: INFEASIBLE` → present the reasons to the human and **STOP this turn**. Build
  nothing. (Infeasible is a complete, legitimate outcome.)

### 2 — Human gate: approve the criteria

The human owns what "done" means. Use **AskUserQuestion** to present the Examples + GATE_CMD
and let them **approve / edit / abort**. Do not proceed on your own opinion of the Examples.

On approval, freeze the Examples and write the gate command to the active marker:

```bash
cat > .spiral/active <<'EOF'
<approved GATE_CMD, combined with any accepted_holes checks via &&>
EOF
```

Persist the approved Examples + gate_cmd into `.spiral/state.json`.

### 3 — Converge: BUILD

Invoke the Convergence role to build:

> `Agent(subagent_type: "spiral:convergence")` with a task beginning `BUILD:` then the
> **approved** Examples and the GATE_CMD. It writes code + tests and must NOT commit.

### 4 — The machine: deterministic gate at commit

Attempt the commit yourself (this is the delivery; the hook gates it). Never stage the
`.spiral/` state dir — exclude it explicitly so state never enters the commit even if the
`.gitignore` setup was skipped:

```bash
git add -A && git reset -q -- .spiral 2>/dev/null
git commit -m "spiral(turn N): <goal one-liner>"
```

- **Commit succeeds** → the gate is green; proceed to Divergence.
- **Commit blocked** (the hook exits 2 with `SPIRAL GATE FAILED`) → the build is *not done*.
  Feed the gate output back into a new `BUILD:` invocation (oscillation). Cap at **2**
  rebuilds; if still red, surface the failure to the human and let them decide (fix path,
  edit Examples, or stop). Never bypass the gate.

### 5 — Diverge: independent judgment

Only after a green commit, invoke the Divergence role:

> `Agent(subagent_type: "spiral:divergence")` with the goal, the approved Examples, and the
> commit ref. It is independent — pass it the artifact and goal, not Convergence's notes.

It returns a VERDICT (opinion on goal-fulfilment), HOLES (each with a proposed next-turn
gate check), and NEXT_SEEDS.

### 6 — Human gate: STOP or continue

Clear the active marker (`rm -f .spiral/active`) so the gate goes dormant. Use
**AskUserQuestion** to present the Divergence feedback and let the human decide:

- **STOP** — ship. End the spiral. (Feedback is not "fix now"; the human owns when good
  enough is good enough.)
- **Continue** — start the next turn. Append accepted HOLES to `accepted_holes` (they become
  required gate checks next turn), set the seed to a chosen NEXT_SEED, increment `turn`,
  append to `feedback_log`, then go back to step 1.
- **Reframe** — the layer is a dead end; the human widens the scope. Take their reframed
  goal as the new seed and go to step 1. (No platform primitive widens scope mid-flow — the
  human does it by giving a larger goal.)

---

## Rules

- **The human, not you, owns every non-deterministic decision**: the criteria (step 2) and
  the STOP (step 6). You surface options via AskUserQuestion; you do not decide for them.
- **Never bypass the gate.** A red gate means not done. No `--no-verify`, no editing the gate
  to pass, no committing around it.
- **Keep the roles independent.** Always invoke the named subagents; never let one role's
  output leak into the other beyond the artifact + goal the orchestrator passes.
- **Files are the source of truth.** State lives in `.spiral/state.json`; the result lives in
  the commit. Your prose is for the human, not the record.
- MVP scope: one goal, one turn at a time, single Convergence + single Divergence, no
  parallel fan-out.
