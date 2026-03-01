# OMT - One Man Team Plugin

A streamlined Agent-First development workflow for Claude Code. Your personal development squad that makes one person feel like a team.

## Overview

**OMT (One Man Team)** transforms your development workflow:

- **One command** — `/omt "goal"` launches the full lifecycle
- **One decision point** — approve the consensus, then sit back
- **Agents execute** — autonomous development until completion or escalation
- **Contracts connect** — clear input/output definitions between agents

## Hive Mode: Autonomous Lifecycle

The `/omt` command launches **@hive**, the lifecycle coordinator that handles everything:

```
/omt "Build user authentication with JWT"
  │
  ▼
@hive initializes workspace
  │
  ▼
@hive ──dispatch──▶ @pm (autonomous requirements)
                    └─▶ .agents/outputs/pm.md
  │
  ▼
@hive ──dispatch──▶ @arch (autonomous architecture)
                    └─▶ .agents/outputs/arch.md
  │
  ▼
@hive presents consensus summary
  + all decision points collected upfront
  │
  ▼
Human approves (single interaction)
  │
  ▼
For each task:
  @hive ──dispatch──▶ @dev (TDD implementation)
  @hive ──dispatch──▶ @reviewer (review + commit)
  (retry ≤3, then escalate)
  │
  ▼
Completion report → .agents/outputs/hive.md
```

**Key Design**: All decision points are front-loaded into the consensus gate. After approval, execution proceeds without interruption.

## Features

### 5 Core Agents

| Agent | Phase | Model | Purpose |
|-------|-------|-------|---------|
| @hive | Coordination | claude-sonnet-4-5 | Full lifecycle coordinator — dispatches all other agents |
| @pm | Planning | claude-haiku-4-5 | Requirements management and clarification |
| @arch | Planning | claude-sonnet-4-5 | API-First architecture design |
| @dev | Execution | claude-sonnet-4-5 | Development implementation (TDD + debugging) |
| @reviewer | Review | claude-sonnet-4-5 | Code review + git commit authority |

### Commands

| Command | Purpose |
|---------|---------|
| /omt \<goal\> | Launch autonomous lifecycle — the primary entry point |
| /init-agents | Initialize agent workspace (once per project) |
| /help | Help and command reference |
| /git-commit | Emergency manual commit |

### Contract-First Design

**Planning Phase Outputs (Autonomous via @hive)**:

| Agent | Output | Contract |
|-------|--------|----------|
| Human | goal.md | - |
| @pm | outputs/pm.md | pm.json |
| @arch | outputs/arch.md | arch.json |

**Execution Phase Contracts**:

| Contract | Connection | Definition |
|----------|------------|------------|
| dev.json | @dev → @reviewer | Implementation results and test coverage |
| hive.json | @hive lifecycle | Full lifecycle coordination |

**Skills**:
- `contract-validation` - Validate agent contracts

### Git Workflow

**Commit Authority**:

**Has commit authority:**
- `@reviewer` (automatic after review)
- `/git-commit` (manual, emergency only)

**No commit authority:**
- All other agents (including @hive)

**Commit Format**:

```
<type>[optional scope]: <description>

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Failure Protection

- Auto-escalation after 3 consecutive failures
- Clear error reporting with actionable suggestions
- All decision points front-loaded to prevent mid-execution blocks

## Installation

### 1. Add Marketplace

```bash
/plugin marketplace add musingfox/cc-plugins
```

### 2. Install Plugin

```bash
/plugin install omt
```

### 3. Initialize Workspace

In your project root:

```bash
/init-agents
```

This will:
- Create `.agents/` directory structure with `.state/` infrastructure
- Configure task management system
- Update `.gitignore` rules

## Usage

### Quick Start

```bash
# 1. Initialize workspace (once per project)
/init-agents

# 2. Launch autonomous workflow
/omt "Implement a REST API for user management with CRUD operations"

# 3. Review the consensus summary when @hive presents it
# 4. Approve → autonomous execution begins
# 5. Done!
```

### Example: New Feature

```bash
# Launch with a detailed goal
/omt "Build user authentication with JWT, including login, signup, password reset, and role-based access control"

# @hive will:
# 1. Dispatch @pm to define requirements autonomously
# 2. Dispatch @arch to design architecture autonomously
# 3. Present a consensus summary with all decision points
# 4. After your approval, execute @dev → @reviewer for each task
# 5. Generate a completion report
```

## Agent Workspace

### Structure

```
.agents/
├── .gitignore           # Ignores .state/
├── goal.md              # Human's goal
├── outputs/
│   ├── pm.md            # @pm requirements
│   ├── arch.md          # @arch architecture
│   ├── dev/             # Per-stage @dev reports
│   ├── reviews/        # Per-stage @reviewer reports
│   └── hive.md          # @hive completion report
└── .state/              # Infrastructure (gitignored)
    ├── config.json      # Workspace configuration
    ├── state.json       # Task state
    ├── hive-state.json  # @hive lifecycle state
    └── tasks/           # Task tracking data
```

## Library (lib/)

- `contract-validator.ts` - Contract validation
- `state-manager.ts` - State management

## Documentation

- **Quick Start**: See `commands/help.md`
- **Command Reference**: See `commands/` directory
- **Agent Specifications**: See `agents/` directory
- **Contracts**: See `contracts/` directory

## License

MIT License

## Support

For issues and feedback:
- GitHub Issues: https://github.com/musingfox/cc-plugins/issues
- Documentation: Plugin installation includes complete docs

---

**Last Updated**: 2026-03-01
**Status**: Production Ready
