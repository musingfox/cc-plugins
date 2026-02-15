---
name: help
description: Quick reference for the OMT Agent-First workflow — 5 agents, 4 commands, and Triangle Consensus design
model: claude-haiku-4-5
---

# OMT (One Man Team) — Quick Reference

## Overview

The **Agent-First Workflow** uses Contract-First design and autonomous execution:
- **Humans** make critical decisions (requirements, architecture, approvals)
- **Agents** autonomously execute complex work
- **Contracts** validate input/output at every stage

## Workflow: Triangle Consensus → Autonomous Execution

```
Triangle Consensus (Human decides):
  Human ↔ @pm ↔ @arch
  ↓ (all three agree)
Autonomous Execution (@coord-exec dispatches):
  @dev (implement) → @reviewer (review + commit)
  ↓ (loop until complete or escalate after 3 failures)
Done
```

---

## Commands (4)

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

### @pm (Haiku)
**Role**: Requirements management
**Trigger**: User describes a feature or goal
**Does**: Analyzes project status, provides options, executes based on user instructions
**Output**: `outputs/pm.md` — requirements document
**Contract**: `contracts/pm.json`

### @arch (Sonnet)
**Role**: Technical architecture design
**Trigger**: After requirements are defined
**Does**: API-First methodology — defines interfaces, types, and system architecture
**Output**: `outputs/arch.md` — architecture document
**Contract**: `contracts/arch.json`

### @coord-exec (Sonnet)
**Role**: Execution coordinator
**Trigger**: After Triangle Consensus (Human + @pm + @arch agree)
**Does**: Dispatches @dev and @reviewer, loops until completion, escalates after 3 failures
**Tools**: Can spawn sub-agents via Task tool

### @dev (Sonnet)
**Role**: TDD implementation + debugging
**Trigger**: Dispatched by @coord-exec
**Does**: Red-Green-Refactor cycle, systematic root cause analysis for bugs
**Output**: Test files in `tests/`, implementation in `src/`, summary in `outputs/dev.md`
**Contract**: `contracts/dev.json`

### @reviewer (Sonnet)
**Role**: Code review + git commit authority
**Trigger**: After @dev completes
**Does**: Validates against PRD, checks test coverage, verifies docs, creates git commits
**Authority**: Only entity (besides `/git-commit`) that can commit code

---

## Getting Started

```bash
# 1. Initialize workspace
/init-agents

# 2. Describe your goal — @pm will analyze and propose options
# 3. @arch designs the architecture
# 4. Triangle Consensus: you, @pm, and @arch agree
# 5. @coord-exec takes over — autonomous execution begins
```

## Workspace Structure

```
.agents/
├── state.json          # Agent execution state
├── goal.md             # Human-defined goal
├── outputs/
│   ├── pm.md           # @pm requirements
│   ├── arch.md         # @arch architecture
│   └── dev.md          # @dev implementation summary
└── tasks/              # Task tracking data
```

## Contract Validation

Every agent validates input/output contracts before and after execution. Contracts are defined in `contracts/*.json` and validated by `lib/contract-validator.ts`. See the `contract-validation` skill for details.

## Key Principles

- **Only 2 entities commit**: @reviewer (after review) and `/git-commit` (emergency)
- **Escalation after 3 failures**: @coord-exec stops and asks the human
- **Contract-First**: Interfaces defined before implementation
- **Triangle Consensus**: No autonomous execution until Human + @pm + @arch agree
