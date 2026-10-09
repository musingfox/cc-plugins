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

The default implementer is the Claude `cf:implement` agent. OMP, a worker outside Claude Code, is the opt-in overflow builder (`CF_IMPLEMENTER=omp`); its model and thinking level come from `PI_DISPATCH_CMD`, not from frontmatter.

## Pipeline

```
[research] → validate → [plan] → validate → HUMAN GATE (High decisions only)
    → [implement — cf:implement shards, OMP opt-in] → gates
    → [review — Standards + Spec] → verdict → spec upkeep → rebase
```

## Phases

| Phase | Purpose |
|-------|---------|
| **Research** | Explore codebase, produce capability inventory with constraints and evidence |
| **Plan** | Design behavioral contracts with test cases; tier decisions High/Medium/Low |
| **Implement** | `cf:implement` agents fulfil the contracts in parallel shards, each in its own worktree; OMP workers do the same when opted in |
| **Review** | Two read-only reviews in parallel: Standards (the repo's documented conventions and a fixed set of code smells) and Spec (every contract, its test cases, and probed edges inside its declared domain). Only Spec routes the verdict |

## Key Features

- **Parallel sharded implementation**: Contracts are grouped by the files they touch; each group runs as a `cf:implement` shard (or an opt-in OMP shard) in its own worktree, passes deterministic gates (report, survivors, the orchestrator's own test run, and a revert check that each contract's tests fail with its implementation reverted), and is integrated before review.
- **Decision tiering**: Plan classifies decisions as High/Medium/Low impact. The human gate surfaces High decisions only; Medium and Low stay with the plan agent.
- **Behavioral contracts**: Contracts define input/output/errors, not file paths. Implementation plan is separate guidance.
- **Opinionated orchestrator**: At every human interaction, the orchestrator provides its own analysis and recommendation — not just a list to approve.
- **Loop-back with budget**: Any phase can loop back. Every re-dispatch draws on one counter, max 4 retries per flow; reaching it forces a human check-in, not a hard stop.
- **Graceful degradation**: Structured escalation with re-entry points. Agents provide decision support when stuck.
- **Spec upkeep**: After a PASS, the orchestrator writes a `proposed` spec entry only when the flow left something the next flow must know — a deliberate non-goal, an interface to reuse, or a spec that proved stale. Most flows write none; the human promotes what they keep.
- **Pluggable agents**: The flow defines contracts, not agents. Specialized agents can substitute defaults if they satisfy the same contract.

## Progress Band

While a `/cf` flow runs, one line above the prompt shows `● cf <name> · <phase> · <elapsed>`: the flow's slug, the phase it is in (setup, research, plan, implement, review), and whole minutes since the flow started. During implement it adds the shards passed over the total, the round in progress and the retries left; while a question to you is open it adds `waiting for you` and turns the dot to the warning colour. The band reads cf's own files and Bash commands, never changes them, and redraws every 10 seconds.

When a flow ends, a record of how its time split across the six totals (setup, research, plan, implement, review, waiting) is kept in the plugin store under the key `flows`, newest 100 only. Its outcome is `cleanup` (the flow ran its cleanup script), `abandoned` (a different flow replaced it) or `session-end` (the Claude session ended first). A flow that one command both opens and closes, such as a fresh session's first command sourcing `env.sh` and then running cleanup, keeps no record, because it has no timing to report.

The band is a Claude Mod and needs Claude Code 2.1.293+.

## Installation

```
/plugin install context-flow
```

### Worktree Permissions

Parallel `cf:implement` builders write their shard worktrees under `/tmp`: cf sessions live in `/tmp/cf-*`. To spare a permission prompt per shard, add both `/tmp` and `/private/tmp` (macOS resolves `/tmp` there) to `permissions.additionalDirectories` in `~/.claude/settings.json`:

```json
{ "permissions": { "additionalDirectories": ["/tmp", "/private/tmp"] } }
```

A top-level `additionalDirectories` key has no effect; it must sit under `permissions`.

### Dependencies

- **The pi-dispatch plugin** — required, and declared in `plugin.json`: it supplies the shard worktrees and the gate scripts that every Phase 3 builder runs through. Without it `cf-pi-setup.sh` exits 4 before the flow starts.
- **`jq`, `perl` and `python3`** — required on `PATH`; the Phase 3 scripts call them.

### Optional Dependencies

- **pi** (`npm i -g @earendil-works/pi-coding-agent`) with `PI_DISPATCH_CMD` set — optional, needed only for the OMP opt-in builder. Without it, setup records `PI_AVAILABLE=0` and Phase 3 stays on `cf:implement`.
- **`CF_IMPLEMENTER=omp`** — opt in to OMP as the Phase 3 builder; set it in the environment before `/cf` starts. `cf-pi-setup.sh` records the choice once as `CF_IMPLEMENTER=<claude|omp>` in the session's `env.sh`; unset, empty or any other value records `claude`.
- **`ctx7` CLI** (`npm i -g ctx7` then `ctx7 login`) — enables research and implement phases to verify third-party library / API behavior with version-specific docs. Falls back to `WebFetch` if not installed. Without either, agents report Unresolved when the goal hinges on external behavior they can't infer from the local codebase.

### Direct Sub-agent Invocation Caveat

Agents (`@cf:research`, `@cf:plan`, etc.) are designed to be dispatched by the `/cf` orchestrator, which hands each one exactly the inputs its contract names. **If you invoke a sub-agent directly** (e.g., `@cf:research <goal>`), it still runs on its pinned model and effort, but without the orchestrator's transition validation, human gate, and loop budget. Prefer `/cf` for full pipeline behavior.

## Design Documentation

See [docs/](docs/): `parallel-sharded-design.md` (Phase 3 sharding), `pi-implementer-protocol.md` (the implementer brief, report schema and gates), `human-gate-protocol.md`, and `escalation-protocol.md`.
