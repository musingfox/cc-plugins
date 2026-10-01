# Context Flow

Contract-driven development pipeline with human-in-the-loop decision gating.

## Philosophy

**Agent = Context + Goal + Tools**

Agents are NOT defined by roles. Each agent is defined by what information it receives, what output it must produce, and what tools it can use. Everything is connected by **contracts** — behavioral specifications with concrete test cases.

## Usage

```
/cf "Add CSV export for transaction history"
/cf "Implement the contracts in docs/handoff-csv-export.md"
```

`/cf` takes one argument: the goal. There are no mode flags.

A goal that points at a handoff document carrying explicit, human-approved contracts runs in **baton mode**: research shrinks to a gap-scan of what the handoff does not cover, plan consumes its contracts verbatim, and the human gate collapses to breaking changes only. A document that merely states a direction is an ordinary goal.

## Effort per Seat

Each agent pins its own `model:` and `effort:` in frontmatter; the orchestrator sets neither at dispatch. Effort rises with how much of the seat's work is still undecided, and the model follows it: `cf:implement` executes pinned contracts on `sonnet` at `medium`, while `cf:research`, `cf:plan` and `cf:review` run on `opus` at `xhigh`. `cf:implement` sits at `medium` rather than `low` because Sonnet at `low` sometimes reports a change done without running its check. The `opus` pin keeps the `xhigh` seats off Sonnet when the session runs on it, and keeps the judge at or above the builder.

The default implementer is an OMP worker outside Claude Code. Its model and thinking level come from `PI_DISPATCH_CMD`, not from frontmatter.

## Pipeline

```
[research] → validate → [plan] → validate → HUMAN GATE (High decisions only)
    → [implement — OMP shards, Claude fallback] → gates
    → [review — Standards + Spec] → verdict → spec upkeep → rebase
```

## Phases

| Phase | Purpose |
|-------|---------|
| **Research** | Explore codebase, produce capability inventory with constraints and evidence |
| **Plan** | Design behavioral contracts with test cases; tier decisions High/Medium/Low |
| **Implement** | OMP workers fulfil the contracts in parallel shards; the Claude `cf:implement` agent takes over when pi is unavailable or out of quota |
| **Review** | Two read-only reviews in parallel: Standards (the repo's documented conventions and a fixed set of code smells) and Spec (every contract, its test cases, and probed edges inside its declared domain). Only Spec routes the verdict |

## Key Features

- **Parallel sharded implementation**: Contracts are grouped by the files they touch; each group runs as an OMP shard in its own worktree, passes deterministic gates (report, survivors, the orchestrator's own test run, and a revert check that each contract's tests fail with its implementation reverted), and is integrated before review.
- **Decision tiering**: Plan classifies decisions as High/Medium/Low impact. The human gate surfaces High decisions only; Medium and Low stay with the plan agent.
- **Behavioral contracts**: Contracts define input/output/errors, not file paths. Implementation plan is separate guidance.
- **Opinionated orchestrator**: At every human interaction, the orchestrator provides its own analysis and recommendation — not just a list to approve.
- **Loop-back with budget**: Any phase can loop back. Every re-dispatch draws on one counter, max 4 retries per flow; reaching it forces a human check-in, not a hard stop.
- **Graceful degradation**: Structured escalation with re-entry points. Agents provide decision support when stuck.
- **Spec upkeep**: After a PASS, the orchestrator writes a `proposed` spec entry only when the flow left something the next flow must know — a deliberate non-goal, an interface to reuse, or a spec that proved stale. Most flows write none; the human promotes what they keep.
- **Pluggable agents**: The flow defines contracts, not agents. Specialized agents can substitute defaults if they satisfy the same contract.

## Installation

```
/plugin install context-flow
```

### Optional Dependencies

- **pi** (`npm i -g @earendil-works/pi-coding-agent`) with `PI_DISPATCH_CMD` set — the default Phase 3 implementer. Without it, setup records `PI_AVAILABLE=0` and Phase 3 runs on the Claude `cf:implement` fallback. The pi-dispatch skill walks through choosing a command.
- **`CF_IMPLEMENTER=omp`** — opt in to OMP as the Phase 3 builder; set it in the environment before `/cf` starts. `cf-pi-setup.sh` records the choice once as `CF_IMPLEMENTER=<claude|omp>` in the session's `env.sh`; unset, empty or any other value records `claude`.
- **`ctx7` CLI** (`npm i -g ctx7` then `ctx7 login`) — enables research and implement phases to verify third-party library / API behavior with version-specific docs. Falls back to `WebFetch` if not installed. Without either, agents report Unresolved when the goal hinges on external behavior they can't infer from the local codebase.

### Direct Sub-agent Invocation Caveat

Agents (`@cf:research`, `@cf:plan`, etc.) are designed to be dispatched by the `/cf` orchestrator, which hands each one exactly the inputs its contract names. **If you invoke a sub-agent directly** (e.g., `@cf:research <goal>`), it still runs on its pinned model and effort, but without the orchestrator's transition validation, human gate, and loop budget. Prefer `/cf` for full pipeline behavior.

## Design Documentation

See [docs/](docs/): `parallel-sharded-design.md` (Phase 3 sharding), `pi-implementer-protocol.md` (the OMP worker brief and gates), `human-gate-protocol.md`, and `escalation-protocol.md`.
