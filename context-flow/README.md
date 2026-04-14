# Context Flow

Contract-driven development pipeline with human-in-the-loop decision gating.

## Philosophy

**Agent = Context + Goal + Tools**

Agents are NOT defined by roles. Each agent is defined by what information it receives, what output it must produce, and what tools it can use. Everything is connected by **contracts** — behavioral specifications with concrete test cases.

## Usage

```
/cf "Add CSV export for transaction history"
/cf --deep "Redesign auth middleware for OAuth2"
/cf --fast "Fix typo in README"
/cf --fast --plan=pro "Quick fix but careful planning"
```

### Mode Flags

| Flag | Behavior |
|------|----------|
| *(none)* | Default mode — balanced cost/quality |
| `--fast` | Speed-optimized — uses lighter models, skips Agent Teams |
| `--deep` | Maximum quality — uses strongest models throughout |

### Per-Stage Overrides

Override the model tier for any individual stage:

```
/cf --fast --plan=pro "goal"       # fast mode, but plan uses Opus
/cf --deep --implement=lite "goal" # deep mode, but implement uses Haiku
```

Valid stages: `research`, `plan`, `implement`, `review`
Valid tiers: `lite`, `standard`, `pro`

## Model Tier System

Each stage has 3 agent variants mapped to model tiers:

| Tier | Model | Use Case |
|------|-------|----------|
| `lite` | Haiku | Speed-optimized, simple tasks |
| `standard` | Sonnet | Balanced cost/quality (default) |
| `pro` | Opus | Maximum reasoning depth |

### Mode Presets

| Stage | fast | default | deep |
|-------|------|---------|------|
| research | lite | standard | pro |
| plan | standard | pro | pro |
| implement | lite | standard | standard |
| review | lite | standard | standard |

Plan defaults to `pro` because design decision quality is the pipeline's bottleneck. Review caps at `standard` because verification is a mechanical check against contracts — expensive models add little value (ref: AgentOpt Critic-role findings). Implement caps at `standard` because faithful execution doesn't require deep reasoning.

## Pipeline

```
[research — Agent Teams] → validate → [plan] → validate → HUMAN GATE
    → [implement] → validate → [review — Agent Teams] → verdict
```

## Phases

| Phase | Purpose |
|-------|---------|
| **Research** | Explore codebase, produce capability inventory with constraints and evidence |
| **Plan** | Design behavioral contracts with decision tiering (High/Medium/Low) |
| **Implement** | Fulfill contracts, write code and tests; all tests must pass |
| **Review** | Verify implementation satisfies contracts; flag advisories |

## Key Features

- **Dynamic model selection**: Orchestrator selects agent model tier per stage based on mode, per-stage overrides, and complexity assessment.
- **Agent Teams by default**: Research and Review use multi-perspective Agent Teams by default; skip to single agent for trivially simple goals or `--fast` mode.
- **Agent Teams model mixing**: Lead teammate uses resolved tier, additional teammates use one tier lower (minimum standard).
- **Parallel implementation**: When contracts are independent, the orchestrator dispatches multiple implement agents concurrently with worktree isolation.
- **Decision tiering**: Plan classifies decisions as High/Medium/Low impact. Human gate only blocks on High/Medium. Structural minimum rules prevent under-classification.
- **Behavioral contracts**: Contracts define input/output/errors, not file paths. Implementation plan is separate guidance.
- **Opinionated orchestrator**: At every human interaction, the orchestrator provides its own analysis and recommendation — not just a list to approve.
- **Loop-back with budget**: Any phase can loop back. Phase re-runs: max 2 per phase. Cross-phase loops: max 2 total. Limits trigger escalation, not hard stops.
- **Graceful degradation**: Structured escalation with re-entry points. Agents provide decision support when stuck.
- **Pluggable agents**: The flow defines contracts, not agents. Specialized agents can substitute defaults if they satisfy the same contract.

## Installation

```
/plugin install context-flow
```

## Design Documentation

See [docs/DESIGN-v2.md](docs/DESIGN-v2.md) for the full design rationale, contract structure, and detailed examples.
