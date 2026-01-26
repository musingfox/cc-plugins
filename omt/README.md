# OMT - One Man Team Plugin

A streamlined Agent-First development workflow for Claude Code. Your personal development squad that makes one person feel like a team.

## Overview

**OMT (One Man Team)** transforms your development workflow:

- **Humans plan** - Deep involvement in requirements → clarification → planning
- **Agents execute** - Autonomous development until completion or conflict
- **Contracts connect** - Clear input/output definitions between agents
- **Minimal intervention** - @coord-exec only escalates after 3 failures

## Features

### 5 Core Agents

| Agent | Phase | Model | Purpose |
|-------|-------|-------|---------|
| @pm | Planning | claude-haiku-4-5 | Requirements management and clarification |
| @arch | Planning | claude-sonnet-4-5 | API-First architecture design |
| @coord-exec | Coordination | claude-sonnet-4-5 | Dispatch execution agents, escalate after 3 failures |
| @dev | Execution | claude-sonnet-4-5 | Development implementation (TDD + debugging) |
| @reviewer | Review | claude-sonnet-4-5 | Code review + git commit authority |

### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  PLANNING PHASE - Triangle Consensus                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      Human                                      │
│                    [goal.md]                                    │
│                   Describe goal                                 │
│                   /        \                                    │
│                  /   Agree   \                                  │
│                 /             \                                 │
│            @pm ─────Agree────── @arch                           │
│         [requirements.md]  [implementation.md]                  │
│          Describe needs        Describe approach                │
│                                                                 │
│  All three must agree before entering execution phase           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼ Consensus reached
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION PHASE (Agent Autonomous)                             │
├─────────────────────────────────────────────────────────────────┤
│  @coord-exec auto-dispatches:                                   │
│    ├─ @dev (development implementation)                         │
│    └─ @reviewer (review + commit)                               │
│                                                                 │
│  Loop until:                                                    │
│    ✓ All planned items implemented                              │
│    ✗ Or 3 failures → summarize status and escalate to user      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPLETION or ESCALATION                                       │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Complete: All planned items implemented and committed        │
│  ⚠ Conflict: Implementation conflicts with plan, needs review   │
└─────────────────────────────────────────────────────────────────┘
```

**Planning Phase Outputs**:

| Role | Output File | Content |
|------|-------------|---------|
| Human | goal.md | Describe the goal |
| @pm | requirements.md | Describe requirements |
| @arch | implementation.md | Describe implementation approach |

**Consensus Mechanism (Review Loop)**:

```
1. Human creates goal.md
2. @pm reviews goal.md → creates requirements.md
3. @arch reviews goal.md + requirements.md → creates implementation.md
4. Human reviews all documents
   - If changes needed → return to steps 1-3 for relevant party
   - If all agree → enter execution phase
```

### Commands

| Command | Purpose |
|---------|---------|
| /init-agents | Initialize agent workspace |
| /help | Help and command reference |
| /approve | Review important changes |
| /git-commit | Emergency manual commit |

### Contract-First Design

**Planning Phase Outputs (Three-party Collaboration)**:

| Role | Output | Contract |
|------|--------|----------|
| Human | goal.md | - |
| @pm | requirements.md | pm.json |
| @arch | implementation.md | arch.json |

**Execution Phase Contracts**:

| Contract | Connection | Definition |
|----------|------------|------------|
| dev.json | @dev → @reviewer | Implementation results and test coverage |

**Skills**:
- `contract-validation` - Validate agent contracts

### Git Workflow

**Commit Authority**:

**✅ Has commit authority:**
- `@reviewer` (automatic after review)
- `/git-commit` (manual, emergency only)

**❌ No commit authority:**
- All other agents
- Agents create code changes but cannot commit

**Commit Format**:

```
<type>[optional scope]: <description>

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Failure Protection

- Auto-escalation after 3 retries
- State preservation with git stash
- Clear error reporting and recovery options

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
- Create `.agents/` directory structure
- Initialize state definitions and helper library
- Update `.gitignore` rules

## Usage

### Quick Start

```bash
# 1. Create goal.md describing what you want to build
# 2. @pm clarifies requirements
# 3. @arch designs implementation approach
# 4. Once consensus reached, @coord-exec takes over
# 5. Autonomous execution until complete or escalation
```

### Example: New Feature

```bash
# Human creates goal.md
echo "Build user authentication with JWT" > .agents/goal.md

# @pm reviews and creates requirements.md
# @arch reviews and creates implementation.md
# Human reviews all three documents

# If all agree, @coord-exec dispatches:
# - @dev implements with TDD
# - @reviewer reviews and commits
```

## Agent Workspace

### Structure

```
.agents/
├── goal.md              # Human's goal (planning input)
├── requirements.md      # @pm output
├── implementation.md    # @arch output
├── state.json           # Runtime state
├── outputs/             # Agent execution outputs
│   ├── dev.md          # @dev execution report
│   └── reviewer.md     # @reviewer report
└── tasks/              # Active tasks
```

## Library (lib/)

- `contract-validator.ts` - Contract validation
- `state-manager.ts` - State management

## Documentation

- **Workflow Overview**: See plugin's `docs/workflow.md`
- **Quick Start**: See plugin's `docs/quick-start.md`
- **Contract Validation**: See plugin's `docs/contract-validation.md`
- **Command Reference**: See `commands/` directory
- **Agent Specifications**: See `agents/` directory

## License

MIT License

## Support

For issues and feedback:
- GitHub Issues: https://github.com/musingfox/cc-plugins/issues
- Documentation: Plugin installation includes complete docs

---

**Version**: 2.0.0
**Last Updated**: 2026-01-23
**Status**: Production Ready
