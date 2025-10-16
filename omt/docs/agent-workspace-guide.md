# Agent Local Workspace Guide

> **For workflow overview and agent trigger mechanisms, see `docs/workflow.md`**

## Overview

To implement the Agent-First workflow, each repo needs to establish a local Agent workspace. This workspace provides:
- **Inter-agent communication mechanism**
- **State management and synchronization**
- **Task handoff protocol**
- **Deliverable staging**
- **Logging and monitoring**

**Important**: All Agent workspace data is **local** and will not enter git version control.

## Directory Structure

```
project-root/
├── .claude/                    # Claude configuration (in git)
│   ├── agents/                # Agent definitions
│   ├── commands/              # Commands definitions
│   └── agent-config.yml       # Agent behavior configuration
│
├── .agents/                   # ⭐ Agent workspace (not in git)
│   ├── workspace/            # Each Agent's workspace
│   │   ├── planner/         # Planner dedicated area
│   │   ├── coder/           # Coder dedicated area
│   │   ├── reviewer/        # Reviewer dedicated area
│   │   └── ...
│   │
│   ├── communication/        # Inter-agent communication
│   │   ├── messages/        # Message queue
│   │   ├── handoffs/        # Task handoffs
│   │   └── broadcasts/      # Broadcast notifications
│   │
│   ├── state/               # State management
│   │   ├── active-agents.json
│   │   ├── task-registry.json
│   │   └── checkpoints/
│   │
│   ├── logs/                # Logging system
│   ├── deliverables/        # Deliverable staging
│   ├── metrics/             # Metrics data
│   └── cache/               # Cache
│
└── .gitignore              # Excludes .agents/
```

## Quick Start

### 1. Initialize Agent Workspace

Execute in new project:

```bash
# Method 1: Using initialization script
bash ~/.claude/templates/init-agent-workspace.sh

# Method 2: Manual creation
mkdir -p .agents/{workspace,communication,state,logs,deliverables,metrics,cache}
```

### 2. Configure Git Exclusion Rules

```bash
# Auto-add .gitignore rules
cat ~/.claude/templates/agents-gitignore.txt >> .gitignore
```

### 3. Initialize Each Agent

```bash
./.agents/scripts/init-agent.sh planner
./.agents/scripts/init-agent.sh coder
./.agents/scripts/init-agent.sh reviewer
./.agents/scripts/init-agent.sh debugger
./.agents/scripts/init-agent.sh optimizer
./.agents/scripts/init-agent.sh pm
```

## Task Data Format

### Task JSON (Lightweight State)

**Example: `.agents/tasks/LIN-123.json`**

```json
{
  "task_id": "LIN-123",
  "title": "Implement user authentication API",
  "status": "in_progress",
  "current_agent": "coder",

  "complexity": {
    "estimated": 8,
    "estimated_tokens": 8000,
    "actual": null,
    "actual_tokens": null
  },

  "agents": {
    "planner": {
      "status": "completed",
      "started_at": "2025-10-02T09:00:00Z",
      "completed_at": "2025-10-02T09:30:00Z",
      "output_file": "planner.md",
      "tokens_used": 1200,
      "handoff_to": "coder"
    },
    "coder": {
      "status": "working",
      "started_at": "2025-10-02T09:35:00Z",
      "output_file": "coder.md",
      "checkpoint": "stash@{0}",
      "retry_count": 0
    }
  },

  "metadata": {
    "created_at": "2025-10-02T09:00:00Z",
    "updated_at": "2025-10-02T10:30:00Z"
  }
}
```

### Agent Markdown (Detailed Content)

**Example: `.agents/tasks/LIN-123/planner.md`**

```markdown
# Planner Output - LIN-123

**Estimated Complexity**: 8 (8000 tokens)
**Tokens Used**: 1200

## Requirements
- JWT authentication
- Refresh tokens
- Rate limiting

## Task Breakdown
- [ ] Token service (3 points)
- [ ] Auth middleware (2 points)
- [ ] Rate limiting (2 points)
- [ ] Tests (1 point)

## Handoff to Coder
Files to create: src/auth/token.service.ts, src/auth/auth.middleware.ts
Dependencies: jsonwebtoken, express-rate-limit
```

## Agent Communication Protocol

> **For agent trigger mechanisms and workflow integration, see `agents/*.md` specifications**

### Handoff Protocol (Task Handoff)

After an Agent completes work, it hands off to the next Agent by updating the `handoff_to` field in the JSON:

```javascript
// Planner completes and hands off to Coder
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'  // Auto-set current_agent
});

// Coder finds tasks assigned to itself
const myTasks = AgentTask.findMyTasks('coder');
// Returns all tasks where current_agent === 'coder' and status === 'in_progress'
```

**Simplified Design**:
- No need for complex message queues or handoff files
- Handoff via JSON's `current_agent` and `handoff_to`
- Agents periodically check their own tasks (`findMyTasks`)

## State Management

### State Definitions (Single Source of Truth)

All states defined in `.agents/states.yml`:

```yaml
# Task states
task_states:
  pending: "Waiting to start"
  in_progress: "In progress"
  blocked: "Blocked, requires human intervention"
  completed: "Completed"
  failed: "Failed"
  cancelled: "Cancelled"

# Agent states
agent_states:
  idle: "Idle"
  working: "Working"
  completed: "Completed"
  blocked: "Encountered issues"
  skipped: "Skipped"

# Complexity (Fibonacci)
complexity_scale:
  values: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
  token_estimates:
    1: 1000
    2: 2000
    3: 3000
    5: 5000
    8: 8000
    13: 13000
    21: 21000
    34: 34000
    55: 55000
    89: 89000
```

### State Storage Location

- **Task state**: `status` field in `.agents/tasks/{task-id}.json`
- **Agent state**: `agents.{agent-name}.status` field in `.agents/tasks/{task-id}.json`
- **No additional state files needed**: All states in task JSON

## Data Lifecycle

### Auto Cleanup Mechanism (File mtime-based)

```javascript
const { AgentTask } = require('./.agents/lib');

// Cleanup tasks completed 90 days ago
const cleaned = AgentTask.cleanup(90);
console.log(`Cleaned ${cleaned} old tasks`);
```

**Cleanup Rules**:
- ✅ Only cleanup `completed` or `cancelled` status
- ✅ Determine age based on file `mtime` (modification time)
- ✅ Delete both `.json` file and corresponding folder
- ✅ No archive folder needed

### Periodic Maintenance (Optional)

```bash
# Set up cron job
# Cleanup tasks 90 days old at 2 AM daily
0 2 * * * cd /path/to/project && node -e "require('./.agents/lib').AgentTask.cleanup(90)"
```

## Agent Workflow Examples

### Example 1: Planner → Coder Handoff

```javascript
const { AgentTask } = require('./.agents/lib');

// 1. Planner creates task
const task = AgentTask.create('LIN-123', 'User Authentication API', 8);

// 2. Planner writes PRD
task.writeAgentOutput('planner', `
# PRD: User Authentication API

## Requirements
- JWT authentication
- Refresh tokens
- Rate limiting

## Implementation Plan
...
`);

// 3. Planner completes and hands off
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'  // Auto-set current_agent = 'coder'
});

// 4. Coder finds its tasks
const myTasks = AgentTask.findMyTasks('coder');
console.log(`Found ${myTasks.length} tasks for coder`);

// 5. Coder starts work
task.updateAgent('coder', {
  status: 'working',
  checkpoint: 'stash@{0}'
});
```

### Example 2: Error Escalation (Failure Protection)

```javascript
const { AgentTask } = require('./.agents/lib');

// Coder executes task
const task = new AgentTask('LIN-123').load();
let retryCount = task.agents.coder?.retry_count || 0;

try {
  // Execute tests
  await runTests();
} catch (error) {
  retryCount++;

  if (retryCount >= 3) {
    // Reached retry limit, escalate to human
    task.updateAgent('coder', {
      status: 'blocked',
      retry_count: retryCount,
      checkpoint: 'stash@{0}',
      error_message: error.message
    });

    // Write diagnostic report
    task.appendAgentOutput('coder', `
## 🚨 Human Assistance Needed

**Error**: ${error.message}
**Retry count**: ${retryCount}
**Checkpoint**: stash@{0}

Please check and fix the issue then restart the task.
    `);

    // Mark task as blocked
    const taskData = task.load();
    taskData.status = 'blocked';
    task.save(taskData);

  } else {
    // Update retry count
    task.updateAgent('coder', { retry_count: retryCount });
  }
}
```

## Monitoring and Debugging

### View Task Status

```bash
# View specific task
cat .agents/tasks/LIN-123.json | jq

# View task list
ls .agents/tasks/*.json

# View in-progress tasks
jq -r 'select(.status == "in_progress") | .task_id' .agents/tasks/*.json

# View blocked tasks
jq -r 'select(.status == "blocked") | .task_id' .agents/tasks/*.json
```

### View Agent Output

```bash
# View Planner output
cat .agents/tasks/LIN-123/planner.md

# View Coder work log
cat .agents/tasks/LIN-123/coder.md

# View Reviewer check results
cat .agents/tasks/LIN-123/reviewer.md
```

### View Retrospective Analysis

```bash
# View Retro Agent analysis
ls .agents/retro/
cat .agents/retro/2025-10-sprint-1.md
```

## Best Practices

### 1. Agent Startup

```javascript
const { AgentTask } = require('./.agents/lib');

// Find tasks assigned to me
const myTasks = AgentTask.findMyTasks('coder');
console.log(`Found ${myTasks.length} tasks`);

// Start first task
if (myTasks.length > 0) {
  const task = new AgentTask(myTasks[0].task_id);
  task.updateAgent('coder', { status: 'working' });
}
```

### 2. During Task Execution

```javascript
const task = new AgentTask('LIN-123');

// Start work
task.updateAgent('coder', {
  status: 'working',
  checkpoint: 'stash@{0}'
});

// Record progress
task.appendAgentOutput('coder', `
### Progress Update
- Implemented token service
- Tokens used: 2500
`);

// Complete work
task.updateAgent('coder', {
  status: 'completed',
  tokens_used: 5000,
  handoff_to: 'reviewer'
});
```

### 3. During Task Handoff

```javascript
// Simplified handoff flow
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'  // Auto-set current_agent
});

// Next Agent auto-discovers
const myTasks = AgentTask.findMyTasks('coder');
```

### 4. During Error Handling

```javascript
let retryCount = task.agents.coder?.retry_count || 0;

try {
  await executeTask();
} catch (error) {
  retryCount++;

  if (retryCount >= 3) {
    // Escalate to human
    task.updateAgent('coder', {
      status: 'blocked',
      retry_count: retryCount,
      error_message: error.message
    });

    const taskData = task.load();
    taskData.status = 'blocked';
    task.save(taskData);
  } else {
    task.updateAgent('coder', { retry_count: retryCount });
  }
}
```

## Troubleshooting

### Issue 1: Task Not Found

```bash
# Check if task exists
ls .agents/tasks/LIN-123.json

# Check task content
cat .agents/tasks/LIN-123.json | jq
```

### Issue 2: Agent Can't Find Its Tasks

```javascript
// Check current_agent field
const task = new AgentTask('LIN-123').load();
console.log(task.current_agent);  // Should be 'coder'

// Check task status
console.log(task.status);  // Should be 'in_progress'
```

### Issue 3: Disk Space Insufficient

```bash
# Check workspace size
du -sh .agents/

# Manually cleanup old tasks
node -e "require('./.agents/lib').AgentTask.cleanup(30)"  # 30 days

# See how many tasks cleaned
const cleaned = require('./.agents/lib').AgentTask.cleanup(90);
console.log(`Cleaned ${cleaned} tasks`);
```

## References

- @~/.claude/workflow.md - Complete workflow documentation
- @~/.claude/workflow.md#agent-first-workflow - Agent-First design
- @~/.claude/workflow.md#agent-failure-protection - Failure protection mechanism

---

**Version**: 1.0
**Last Updated**: 2025-10-02
**Status**: Active
