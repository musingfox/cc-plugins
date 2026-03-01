# Agent Local Workspace Guide

> **For workflow overview and agent trigger mechanisms, see `docs/workflow.md`**

## Overview

To implement the Agent-First workflow, each repo needs to establish a local Agent workspace. This workspace provides:
- **Inter-agent communication** via shared output files
- **State management** via `.state/state.json` and `.state/hive-state.json`
- **Task handoff protocol** via @hive coordination
- **Deliverable staging** in `outputs/`

**Important**: Infrastructure files in `.agents/.state/` are gitignored. Development artifacts (`goal.md`, `outputs/`) are tracked.

## Directory Structure

```
project-root/
├── .agents/                    # Agent workspace
│   ├── .gitignore              # Ignores .state/
│   ├── goal.md                 # Human-defined goal
│   ├── outputs/                # Agent output files
│   │   ├── pm.md               # @pm requirements
│   │   ├── arch.md             # @arch architecture
│   │   ├── dev/                # Per-stage @dev reports
│   │   ├── reviews/            # Per-stage @reviewer reports
│   │   └── hive.md             # @hive completion report
│   └── .state/                 # Infrastructure (gitignored)
│       ├── config.json         # Workspace configuration
│       ├── state.json          # Task state tracking
│       ├── hive-state.json     # @hive lifecycle state
│       └── tasks/              # Task tracking data
└── .gitignore                  # Excludes .agents/.state/
```

## Quick Start

### 1. Initialize Agent Workspace

```bash
# Using /init-agents command (recommended)
/init-agents

# Or using CLI directly
bun run omt/bin/cli.ts init --task-mgmt local
```

### 2. Verify Setup

```bash
bun run omt/bin/cli.ts status
```

## State Management

### State Files

All state is stored in `.agents/.state/`:

- **state.json**: Task-level state tracking (current phase, agent execution records, validation results)
- **hive-state.json**: @hive lifecycle state (phase, goal, consensus, execution progress)
- **config.json**: Workspace configuration (version, task management system, complexity scale)

### State Manager API

```typescript
import { StateManager } from '${CLAUDE_PLUGIN_ROOT}/lib/state-manager.ts';

const stateManager = new StateManager(process.cwd());

// Initialize a task
await stateManager.initTask('TASK-123', 'Implement auth API');

// Read current state
const state = await stateManager.readState();

// Record agent completion
await stateManager.recordPlanningAgent('arch', '.agents/outputs/arch.md', validationResult);

// Get outputs directory
const outputsDir = stateManager.getOutputsDir(); // → .agents/outputs
```

### CLI Status

```bash
# View workspace status
bun run omt/bin/cli.ts status

# View state files directly
cat .agents/.state/state.json | jq
cat .agents/.state/hive-state.json | jq
```

## Agent Communication Protocol

### Hive-Coordinated Handoff

In the OMT workflow, @hive coordinates all agent handoffs:

```
@hive dispatches @pm → writes .agents/outputs/pm.md
@hive dispatches @arch → reads pm.md, writes .agents/outputs/arch.md
@hive dispatches @dev → reads pm.md + arch.md, writes .agents/outputs/dev/{stage-id}.md
@hive dispatches @reviewer → reviews dev output, creates git commit
```

### Contract Validation at Each Handoff

Before each agent starts, its input contract is validated against the available outputs:

```
1. Agent B needs Agent A's output
2. Validate Agent A's output contract (already recorded in .state/state.json)
3. Read Agent A's output files as Agent B's input
4. Validate Agent B's input contract
5. Execute Agent B
```

## Monitoring and Debugging

### View Current State

```bash
# Workspace status overview
bun run omt/bin/cli.ts status

# View hive lifecycle state
cat .agents/.state/hive-state.json | jq

# View task state
cat .agents/.state/state.json | jq
```

### View Agent Outputs

```bash
# View requirements
cat .agents/outputs/pm.md

# View architecture
cat .agents/outputs/arch.md

# View development reports (per-stage)
ls .agents/outputs/dev/

# View hive completion report
cat .agents/outputs/hive.md
```

### Validate Contracts

```bash
# Validate agent input contract
bun run omt/bin/cli.ts validate --agent dev --phase input --data '{"requirements":"...", "architecture":"..."}'

# Validate agent output contract
bun run omt/bin/cli.ts validate --agent dev --phase output --data '{"test_files":["test.ts"], "tests_status":"5/5 passed"}'
```

## Best Practices

### 1. Use /omt for Full Lifecycle

The `/omt` command handles all agent coordination. Direct agent invocation is for advanced use cases only.

### 2. Check State on Issues

When something goes wrong, check `.state/hive-state.json` to understand where the lifecycle paused.

### 3. Reset State Cleanly

```bash
# Reset infrastructure only (keeps outputs)
rm -rf .agents/.state && bun run omt/bin/cli.ts init

# Full reset
rm -rf .agents && /init-agents
```

## Troubleshooting

### Issue 1: Workspace Not Initialized

```
error: .agents/.state/ not found
```

Run `/init-agents` or `bun run omt/bin/cli.ts init`.

### Issue 2: Stale State

If the hive-state.json shows a phase that doesn't match reality:

```bash
# View current state
cat .agents/.state/hive-state.json | jq .phase

# Reset state files
rm .agents/.state/hive-state.json .agents/.state/state.json
bun run omt/bin/cli.ts init
```

### Issue 3: Agent Can't Find Inputs

Check that upstream agent outputs exist:

```bash
ls -la .agents/outputs/
```

If missing, re-run the upstream agent or the full `/omt` workflow.

## References

- `docs/workflow.md` - Complete workflow documentation
- `docs/contract-validation.md` - Contract validation system
- `docs/sdd-methodology.md` - SDD methodology
- `contracts/` - Agent contract definitions

---

**Version**: 2.0
**Last Updated**: 2026-02-15
**Status**: Active
