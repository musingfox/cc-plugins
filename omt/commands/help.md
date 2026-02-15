---
name: help
description: Quick reference for the OMT Agent-First workflow — 5 agents, 5 commands, and autonomous lifecycle coordination
model: claude-haiku-4-5
---

# OMT (One Man Team) — Quick Reference

## Overview

The **Agent-First Workflow** uses Contract-First design and autonomous execution:
- **Humans** provide a goal and approve consensus
- **@hive** autonomously coordinates the full lifecycle
- **Contracts** validate input/output at every stage

## Workflow: /omt → Autonomous Lifecycle

```
/omt "Build feature X"
  → @hive initializes workspace
  → @hive dispatches @pm (autonomous requirements)
  → @hive dispatches @arch (autonomous architecture)
  → @hive presents consensus summary with decision points
  → Human approves (single interaction)
  → @hive executes @dev → @reviewer loop per task
  → Done (or escalate after 3 failures)
```

---

## Commands (5)

### `/omt <goal>`
**When**: Start a new feature or task
**Does**: Launches @hive for full autonomous lifecycle — planning, consensus, execution

### `/init-agents`
**When**: New project setup
**Does**: Creates `.agents/` workspace, task management config, state definitions

### `/approve`
**When**: API changes, schema modifications, security updates
**Does**: Review and approve/reject important changes before commit

### `/git-commit`
**When**: Emergency manual intervention
**Does**: Direct git commit with conventional commit format

### `/help`
**When**: Need a quick reference
**Does**: Shows this guide

---

## Agents (5)

### @hive (Sonnet)
**Role**: Full lifecycle coordinator
**Trigger**: `/omt` command
**Does**: Dispatches @pm and @arch autonomously, presents consensus, executes @dev/@reviewer loop
**Output**: `.agents/outputs/hive.md` — lifecycle report
**Contract**: `contracts/hive.json`

### @pm (Haiku)
**Role**: Requirements management
**Trigger**: Dispatched by @hive (autonomous mode) or manually by user
**Does**: Analyzes project status, defines user stories and acceptance criteria
**Output**: `.agents/outputs/pm.md` — requirements document
**Contract**: `contracts/pm.json`

### @arch (Sonnet)
**Role**: Technical architecture design
**Trigger**: Dispatched by @hive (autonomous mode) or manually by user
**Does**: API-First methodology — defines interfaces, types, pseudocode, and architecture
**Output**: `.agents/outputs/arch.md` — architecture document
**Contract**: `contracts/arch.json`

### @dev (Sonnet)
**Role**: TDD implementation + debugging
**Trigger**: Dispatched by @hive during execution phase
**Does**: Red-Green-Refactor cycle, systematic root cause analysis for bugs
**Output**: Test files in `tests/`, implementation in `src/`, summary in `.agents/outputs/dev.md`
**Contract**: `contracts/dev.json`

### @reviewer (Sonnet)
**Role**: Code review + git commit authority
**Trigger**: Dispatched by @hive after @dev completes
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
├── goal.md             # Human-defined goal
├── hive-state.json     # @hive lifecycle state
├── outputs/
│   ├── pm.md           # @pm requirements
│   ├── arch.md         # @arch architecture
│   ├── dev.md          # @dev implementation summary
│   └── hive.md         # @hive completion report
└── tasks/              # Task tracking data
```

## Contract Validation

Every agent validates input/output contracts before and after execution. Contracts are defined in `contracts/*.json` and validated by `lib/contract-validator.ts`. See the `contract-validation` skill for details.

## Key Principles

- **Single Human Interaction**: Only the consensus gate requires your input
- **Only 2 entities commit**: @reviewer (after review) and `/git-commit` (emergency)
- **Escalation after 3 failures**: @hive stops and asks the human
- **Contract-First**: Interfaces defined before implementation
- **Decision Points Front-Loaded**: All choices collected before execution begins
