---
name: help
description: Quick reference for the OMT Agent-First workflow — 5 agents, 5 commands, and autonomous lifecycle coordination
model: claude-haiku-4-5
---

# OMT (One Man Team) — Quick Reference

## Overview

The **Agent-First Workflow** uses Contract-First design and autonomous execution:
- **Humans** provide a goal and approve consensus
- **`/omt`** orchestrates the full lifecycle — dispatches all agents, presents consensus, runs execution loop
- **Contracts** validate input/output at every stage

## Workflow: /omt → Full Orchestration

```
/omt "Build feature X"
  → /omt captures goal and validates workspace
  → /omt dispatches @pm (autonomous requirements)
  → /omt dispatches @arch (autonomous architecture)
  → /omt dispatches @hive (consensus analysis)
  → /omt presents consensus summary to human
  → Human approves (single interaction)
  → /omt executes @dev → @reviewer loop per stage
  → Done (or /omt escalates after 3 failures)
```

---

## Commands (4)

### `/omt <goal>`
**When**: Start a new feature or task
**Does**: Full orchestration — dispatches @pm, @arch, @hive, presents consensus, executes @dev/@reviewer loop

### `/init-agents`
**When**: New project setup
**Does**: Creates `.agents/` workspace with `.state/` infrastructure

### `/git-commit`
**When**: Emergency manual intervention
**Does**: Direct git commit with conventional commit format

### `/help`
**When**: Need a quick reference
**Does**: Shows this guide

---

## Agents (5)

### @hive (Sonnet)
**Role**: Consensus builder and analysis
**Trigger**: Dispatched by `/omt` after @pm and @arch complete
**Does**: Reads pm.md and arch.md, verifies contract artifacts, extracts decision points, builds consensus summary and stage execution plan
**Output**: `.agents/outputs/hive-consensus.md` — consensus analysis
**Contract**: `contracts/hive.json`

### @pm (Haiku)
**Role**: Requirements management
**Trigger**: Dispatched by `/omt` (autonomous mode) or manually by user
**Does**: Analyzes project status, defines user stories and acceptance criteria
**Output**: `.agents/outputs/pm.md` — requirements document
**Contract**: `contracts/pm.json`

### @arch (Sonnet)
**Role**: Technical architecture design
**Trigger**: Dispatched by `/omt` (autonomous mode) or manually by user
**Does**: API-First methodology — defines interfaces, types, pseudocode, and architecture
**Output**: `.agents/outputs/arch.md` — architecture document
**Contract**: `contracts/arch.json`

### @dev (Sonnet)
**Role**: TDD implementation + debugging
**Trigger**: Dispatched by `/omt` during execution phase
**Does**: Red-Green-Refactor cycle, systematic root cause analysis for bugs
**Output**: Test files in `tests/`, implementation in `src/`, summary in `.agents/outputs/dev/{stage-id}.md` (per-stage) or `.agents/outputs/dev.md` (standalone)
**Contract**: `contracts/dev.json`

### @reviewer (Sonnet)
**Role**: Code review + git commit authority
**Trigger**: Dispatched by `/omt` after @dev completes each stage
**Does**: Validates against requirements, checks test coverage, creates git commits
**Authority**: Only entity (besides `/git-commit`) that can commit code

---

## Getting Started

```bash
# 1. Initialize workspace (once per project)
/init-agents

# 2. Launch autonomous workflow
/omt "Implement user authentication with JWT"

# 3. Review consensus summary when presented
# 4. Approve → autonomous execution begins
# 5. Done!
```

## Workspace Structure

```
.agents/
├── .gitignore              # Ignores .state/
├── goal.md                 # Human-defined goal
├── outputs/
│   ├── pm.md               # @pm requirements
│   ├── arch.md             # @arch architecture
│   ├── hive-consensus.md   # @hive consensus analysis
│   ├── dev/                # Per-stage @dev reports
│   ├── reviews/            # Per-stage @reviewer reports
│   └── hive.md             # Completion report
└── .state/                 # Infrastructure (gitignored)
    ├── config.json         # Workspace configuration
    ├── workflow-state.json  # Unified workflow state
    └── tasks/              # Task tracking data
```

## Contract Validation

Every agent validates input/output contracts before and after execution. Contracts are defined in `contracts/*.json` and validated by `lib/contract-validator.ts`. See the `contract-validation` skill for details.

## Key Principles

- **Single Human Interaction**: Only the consensus gate requires your input
- **Only 2 entities commit**: @reviewer (after review) and `/git-commit` (emergency)
- **Escalation after 3 failures**: `/omt` stops and asks the human
- **Contract-First**: Interfaces defined before implementation
- **Decision Points Front-Loaded**: All choices collected before execution begins
