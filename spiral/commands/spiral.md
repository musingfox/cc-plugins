---
description: "Spiral — run one turn of converge → independent gate forging → deterministic gate → independent diverge → human decision, then loop or stop. Two roles run as isolated subagents (Convergence builds, and via a separate build-blind EXAMINE instance forges the gate; Divergence judges); the human is the decision-maker."
argument-hint: "<vague goal>"
allowed-tools: [Agent, Read, Write, Bash, Glob, Grep, AskUserQuestion]
---

# Spiral Orchestrator

You drive the **main thread** — the decision-maker's seat. Two roles run as isolated subagents
(fresh context each time, so they cannot see each other's work): **Convergence** builds, and
**Divergence** judges. The gate itself is forged by Convergence's **EXAMINE** act — a *separate,
build-blind instance* invoked before BUILD, so the exam is never written by the instance that
sits it (concept §8). The deterministic gate runs as a commit hook (the machine, not you,
judges right/wrong). You **do not** build, forge the gate, or judge — each is a role's job; you
would only be the driver doing the hands' work. The human owns the criteria and the STOP. Your
job is to advance the turn — dispatch each act, run the gate to confirm its state, surface the
decisions — never to do their work yourself.

Concept: `${CLAUDE_PLUGIN_ROOT}/docs/concept.md`. The goal for this run is `$ARGUMENTS`.

## Setup (once)

```bash
mkdir -p .spiral
grep -qxF '.spiral/' .gitignore 2>/dev/null || echo '.spiral/' >> .gitignore
```

Read `.spiral/state.json` if it exists (carries `goal`, `turn`, `examples`, `gate_path`,
`accepted_holes`, `feedback_log`). If absent, this is turn 1 with seed = `$ARGUMENTS`.

---

## One turn

### 1 — Converge: FORMALIZE

Invoke the Convergence role to formalize the seed:

> `Agent(subagent_type: "spiral:convergence")` with a task beginning `FORMALIZE:` then the
> current seed and any `accepted_holes` from prior turns (these become required gate checks).

It returns a VERDICT and EXAMPLES (each with a verifiable handle describing *what* would
prove it) plus VERIFY_INFO. It does **not** hand you a runnable gate — only the information
to author one. That separation is deliberate (see step 2). Each Example also carries how any
open choice in it was sorted by **cost to reverse**: a *two-way door* comes with the sane default
it already chose (the loop, not you, corrects these); a *one-way door* comes flagged for the
human, framed by the door it opens/closes. Retrievable facts it resolved by investigation, or — if
it could not — reported as "needs X" (a fact to fetch, never a vote to take).

- If `VERDICT: INFEASIBLE` → present the reasons to the human and **STOP this turn**. Build
  nothing. (Infeasible is a complete, legitimate outcome.)

### 2 — Human gate: approve the criteria

The human owns what "done" means — but ratifying every criterion every turn is the
re-litigation §2 forbids, and it is what makes the human rubber-stamp. So surface **by cost to
reverse**, not exhaustively. Freeze the two-way-door Examples on their chosen defaults (list them
in one line each — the human can still override any, but the loop is the cheaper corrector). Use
**AskUserQuestion** only on the **one-way doors**, each framed by the door it opens/closes (not a
bare value), so the human judges a commitment they actually own. If a FORMALIZE "needs X" fact is
still open, surface it too — as a fact to fetch, not a vote. If there are no one-way doors, present
one compact confirm ("freeze these N criteria — approve / edit"). On approval, freeze the Examples
and persist them into `.spiral/state.json`.

### 2b — EXAMINE: forge the gate from the spec

The gate must be forged by neither the build instance (it would test itself) nor you (your role
is to drive, not to construct — concept §8). Dispatch Convergence's **EXAMINE** act — a fresh,
build-blind instance:

> `Agent(subagent_type: "spiral:convergence")` with a task beginning `EXAMINE:` then the
> **frozen Examples**, the carried `accepted_holes`, the VERIFY_INFO from FORMALIZE, and the
> gate path `.spiral/gate-turn-N.sh`. It forges the deterministic checks from the spec alone
> (this turn's build does not exist yet), confirms the gate is RED, and returns the path. It
> writes only the gate — never implementation, and never reads the build it is gating. Its
> independence is the fresh context + the timing (before BUILD), not a different role.

Point the active marker at the EXAMINE gate and sanity-run it (running a check to confirm its
state is review — yours to do — not authoring):

```bash
echo 'bash .spiral/gate-turn-N.sh' > .spiral/active
bash .spiral/gate-turn-N.sh   # expect RED — a gate green before BUILD is a tautology
```

If EXAMINE flags an Example too vague to mechanize, surface it to the human (it is a criteria
gap) — do not let it, or yourself, guess the missing criterion.

### 3 — Converge: BUILD

Invoke the Convergence role to build:

> `Agent(subagent_type: "spiral:convergence")` with a task beginning `BUILD:` then the
> **approved** Examples and the gate path. It writes code + tests and must NOT commit. It may
> self-check against the EXAMINE gate (`bash .spiral/gate-turn-N.sh`) but cannot edit it — the
> gate lives in gitignored `.spiral/`, outside its commit, and a different (earlier, build-blind)
> instance forged it.

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
gate check **and a ship-blocking / parkable tag** — whether shipping it commits to something
expensive to reverse, or is a cheap later fix), and NEXT_SEEDS.

### 6 — Human gate: STOP or continue

Clear the active marker (`rm -f .spiral/active`) so the gate goes dormant. Lead with the
Divergence **VERDICT** as the headline (goal met or not), then use **AskUserQuestion** framed as
the navigation call itself — **ship / continue / reframe** — with the **ship-blocking** holes as
the reasons to weigh. Keep the **parkable** holes collapsed (one line: "N parkable — expand to
see"); they are next-turn `accepted_holes` candidates, not material to the stop/go. The human
decides:

- **STOP** — ship. End the spiral. (Feedback is not "fix now"; the human owns when good
  enough is good enough.)
- **Continue** — start the next turn. Append accepted HOLES to `accepted_holes` (they become
  required gate checks next turn); on a reframe the decision-maker may also **retire or
  supersede** an existing accepted_hole when it has become obsolete or self-contradictory
  (record why — a retirement is itself feedback). Set the seed to a chosen NEXT_SEED,
  increment `turn`, append to `feedback_log`, then go back to step 1.
- **Reframe** — the layer is a dead end; the human widens the scope. Take their reframed
  goal as the new seed and go to step 1. (No platform primitive widens scope mid-flow — the
  human does it by giving a larger goal.)

---

## Rules

- **The human owns the non-deterministic decisions — but you surface them by cost to reverse,
  not exhaustively.** A *one-way door* (expensive to reverse once later turns build on it) and the
  *STOP* are the human's, upfront, via AskUserQuestion — you never decide these for them. A
  *two-way door* (cheap to reverse) is anchored *lazily*: the Convergence default rides, the loop
  surfaces it if wrong, and the human overrides at a later gate. Ratifying every reversible
  criterion every turn is the re-litigation §2 forbids — and what trains the human to rubber-stamp.
  A retrievable fact is nobody's vote: it gets investigated, never asked.
- **Never bypass the gate.** A red gate means not done. No `--no-verify`, no editing the gate
  to pass, no committing around it.
- **The gate is forged by a build-blind EXAMINE instance — not the build instance, not you.**
  FORMALIZE hands over no runnable gate, only Examples + what proves each; a separate Convergence
  instance (EXAMINE act) derives the checks from those frozen Examples, before the build exists,
  into gitignored `.spiral/`. You only dispatch it and run its gate to confirm state. A gate the
  build instance wrote (self-testing), one *you* wrote (the driver doing the hands' work), or one
  anyone transcribed from a handed-over command all re-introduce the bias the machine exists to
  remove (§8). Independence here is fresh context + timing, not a separate agent type.
- **Prefer behavioral handles over structural ones.** A gate that greps for a string proves
  the string exists, not that the behavior works (the §2 false-rigor mistake). When the real
  dependency can't run in the gate, build deterministic fixtures the gate *can* run.
- **Keep the acts independent.** Always invoke the named subagents fresh; never let one act's
  output leak into another beyond what each is owed: EXAMINE gets the spec (frozen Examples +
  VERIFY_INFO + accepted_holes), never the build; Divergence gets the artifact + goal, never the
  build instance's or EXAMINE's notes.
- **Keep each dispatch prompt simple and goal-first.** The agents carry only their motion +
  guardrails; you supply the specifics. State plainly which act and its one goal, then inject
  only what that call needs (the seed, frozen Examples, accepted_holes, gate path, commit ref)
  and the shape to return. Don't pre-load procedure or pour in your own hypotheses — over-steering
  cages a capable agent, and steering the independent Divergence toward what you expect erodes the
  independence that makes it worth dispatching. Build detail when needed; don't bake it into the
  agent.
- **Stay in your lane (driver, not doer).** You dispatch acts, run the gate to observe its
  state, commit, and surface decisions. You do not build, forge the gate, or judge — each is an
  act's job. Running a check is review; writing one is construction (EXAMINE's).
- **Pick each act's model at dispatch — by judgment density × consequence, not by volume.**
  The gate runs no model (it is shell). BUILD's labor → a cheap/fast model, or dispatch its bulk
  to an even cheaper executor (e.g. Pi). EXAMINE (high consequence — a wrong gate passes bad work
  silently) and Divergence (highest judgment) → a strong model, and Divergence must be **≥ the
  build instance** or the judge rubber-stamps. A spawn whose only purpose is keeping the main
  context clean (run a script, read a log — no judgment) → the smallest model. The pattern that
  saves the most: small/fast/parallel agents *gather*, one strong agent *analyses* (the
  pi-dispatch shape). A cheap executor buys a *different failure profile*, not the same result
  cheaper — so the cheaper it is, the more behavioral the gate must be (§2).
- **Files are the source of truth.** State lives in `.spiral/state.json`; the result lives in
  the commit. Your prose is for the human, not the record.
- MVP scope: one goal, one turn at a time, single Convergence (FORMALIZE + EXAMINE + BUILD) +
  single Divergence, no parallel fan-out.
