# Context Flow

Contract-driven development pipeline with human-in-the-loop decision gating.

## Philosophy

**Agent = Context + Goal + Tools**

Agents are NOT defined by roles. Each agent is defined by what information it receives, what output it must produce, and what tools it can use. Everything is connected by **contracts** — behavioral specifications with concrete test cases.

## Usage

```
/cf "Add CSV export for transaction history"
```

The orchestrator manages a 4-phase pipeline:

```
[research] → validate → [plan] → validate → HUMAN GATE → [implement] → validate → [review]
```

## Phases

| Phase | Agent | Purpose |
|-------|-------|---------|
| **Research** | Explore codebase | Produce capability inventory with constraints and evidence |
| **Plan** | Define contracts | Design behavioral contracts with decision tiering (High/Medium/Low) |
| **Implement** | Fulfill contracts | Write code and tests; all tests must pass |
| **Review** | Verify contracts | Confirm implementation satisfies contracts; flag advisories |

## Key Features

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
