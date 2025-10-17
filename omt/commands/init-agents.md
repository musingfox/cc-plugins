---
name: init-agents
description: Initialize Agent-First workflow structure in the current project. Sets up agent workspace, task management, and configuration.
model: claude-haiku-4-5
---

# Init Agents Workspace

Initialize Agent-First workflow structure in the current project.

## What this command does

1. Creates `.agents/` directory structure
2. **Configures task management system** (Linear/GitHub Issues/Jira/Local)
3. Initializes state definitions
4. Configures gitignore rules
5. Creates agent helper library

## Usage

Run this command in any project root to set up the agent workspace.

**IMPORTANT**: This command will ask you to configure the task management system for this project.

---

Please initialize the Agent-First workflow structure in the current project with the following setup:

## Step 0: Configuration

### Package Manager Selection

**First, ask the user which package manager they prefer:**

```
📦 Package Manager Setup

Which JavaScript package manager do you prefer for this project?

A) npm (Node.js default)
B) pnpm (Fast, disk-efficient)
C) bun (Ultra-fast, modern)

Please select (A/B/C):
```

**Store the selection for later use in dependency installation.**

### Task Management System Configuration

**Then, ask the user:**

```
🔧 Task Management System Setup

Which task management system does this project use?

A) Linear (with MCP integration)
B) GitHub Issues
C) Jira
D) Local files (.agents/tasks/)
E) Other

Please select (A/B/C/D/E):
```

**Based on user selection, collect required information:**

### If Linear (A):
```
Linear Configuration:
- Team ID or name: _______________
- API Key (optional, for MCP): _______________
- Workspace: _______________
```

### If GitHub Issues (B):
```
GitHub Configuration:
- Repository: _______________
- Owner: _______________
```

### If Jira (C):
```
Jira Configuration:
- Project Key: _______________
- Site URL: _______________
```

**Note on Jira Integration**: This project uses Atlassian CLI (acli) for direct Jira management.
After `/init-agents` completes, ensure you have installed and authenticated Atlassian CLI:

1. Install ACLI: https://developer.atlassian.com/cloud/acli/guides/install-acli/
2. Authenticate with OAuth:
   ```bash
   acli jira auth
   ```
   Follow the browser OAuth flow to complete authentication.
3. Verify connection:
   ```bash
   acli jira workspace list
   ```

See `jira_cli_integration.md` for detailed usage in agent workflows.

### If Local (D):
```
Local Task Management:
✅ Tasks will be stored in .agents/tasks/
✅ No external integration needed
```

**Create `CLAUDE.md` in project root with STABLE configuration only:**

```markdown
# Project Configuration

## Task Management System

**System**: [Linear/GitHub/Jira/Local]
**Configuration**:
- [Key configuration details based on selection]

## Agent Workspace

Location: `.agents/`
See @.agents/README.md for usage guide.
```

---

## 1. Create Directory Structure

```bash
mkdir -p .agents/tasks
mkdir -p .agents/retro
```

## 2. Install Dependencies

**Based on user's package manager selection, run the appropriate command:**

### If npm (A):
```bash
cd .agents
npm init -y
npm install yaml
cd ..
```

### If pnpm (B):
```bash
cd .agents
pnpm init
pnpm add yaml
cd ..
```

### If bun (C):
```bash
cd .agents
bun init -y
# Remove "type": "module" to use CommonJS (lib.js uses require/module.exports)
sed -i.bak '/"type": "module"/d' package.json && rm package.json.bak
bun add yaml
cd ..
```

**Note**: Bun init defaults to ESM (`"type": "module"`), but lib.js uses CommonJS format. The sed command removes this field to ensure compatibility.

**This creates:**
- `.agents/package.json` - Dependency manifest
- `.agents/node_modules/` - Installed packages (will be gitignored)
- `.agents/package-lock.json` / `pnpm-lock.yaml` / `bun.lockb` - Lock file

## 3. Create Agent Config (.agents/config.yml)

```yaml
# Agent Workspace Configuration
# This file contains DYNAMIC state and runtime information

workspace:
  version: "1.0.0"
  initialized_at: "[CURRENT_TIMESTAMP]"
  location: ".agents/"

task_management:
  system: "[Linear/GitHub/Jira/Local]"
  # Configuration details are stored in project root CLAUDE.md
  # This section tracks runtime state only

runtime:
  last_cleanup: null
  total_tasks_created: 0
  total_tasks_completed: 0
```

## 4. Create State Definitions (.agents/states.yml)

```yaml
# Agent Task States Definition
task_states:
  pending:
    description: "Task created, waiting to start"
    next_states: ["in_progress", "blocked", "cancelled"]

  in_progress:
    description: "Task in progress"
    next_states: ["completed", "blocked", "failed"]

  blocked:
    description: "Task blocked, requires human intervention"
    next_states: ["in_progress", "cancelled"]

  completed:
    description: "Task completed"
    next_states: []

  failed:
    description: "Task failed, cannot complete"
    next_states: ["pending", "cancelled"]

  cancelled:
    description: "Task cancelled"
    next_states: []

agent_states:
  idle:
    description: "Agent idle, waiting for tasks"
  working:
    description: "Agent working"
  completed:
    description: "Agent completed its part"
  blocked:
    description: "Agent encountered issues, cannot continue"
  skipped:
    description: "Agent skipped"

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

## 5. Create Agent Helper Library (.agents/lib.js)

```javascript
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

class AgentTask {
  constructor(taskId) {
    this.taskId = taskId;
    this.jsonPath = `.agents/tasks/${taskId}.json`;
    this.dirPath = `.agents/tasks/${taskId}`;
  }

  // Load task
  load() {
    if (!fs.existsSync(this.jsonPath)) {
      throw new Error(`Task ${this.taskId} not found`);
    }
    return JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
  }

  // Save task
  save(task) {
    fs.writeFileSync(this.jsonPath, JSON.stringify(task, null, 2));
  }

  // Create new task
  static create(taskId, title, complexity = 5) {
    const states = yaml.parse(fs.readFileSync('.agents/states.yml', 'utf8'));
    const estimatedTokens = states.complexity_scale.token_estimates[complexity];

    const task = {
      task_id: taskId,
      title: title,
      status: 'pending',
      current_agent: null,
      complexity: {
        estimated: complexity,
        estimated_tokens: estimatedTokens,
        actual: null,
        actual_tokens: null
      },
      agents: {},
      metadata: {
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };

    const jsonPath = `.agents/tasks/${taskId}.json`;
    const dirPath = `.agents/tasks/${taskId}`;

    fs.writeFileSync(jsonPath, JSON.stringify(task, null, 2));
    fs.mkdirSync(dirPath, { recursive: true });

    return new AgentTask(taskId);
  }

  // Set complexity
  setComplexity(complexity, estimatedTokens = null) {
    const task = this.load();
    task.complexity.estimated = complexity;

    if (estimatedTokens) {
      task.complexity.estimated_tokens = estimatedTokens;
    } else {
      const states = yaml.parse(fs.readFileSync('.agents/states.yml', 'utf8'));
      task.complexity.estimated_tokens = states.complexity_scale.token_estimates[complexity];
    }

    task.metadata.updated_at = new Date().toISOString();
    this.save(task);
  }

  // Update agent status
  updateAgent(agentName, data) {
    const task = this.load();

    if (!task.agents[agentName]) {
      task.agents[agentName] = {};
    }

    Object.assign(task.agents[agentName], data);

    if (data.status === 'working' && !task.agents[agentName].started_at) {
      task.agents[agentName].started_at = new Date().toISOString();
    }

    if (data.status === 'completed' && !task.agents[agentName].completed_at) {
      task.agents[agentName].completed_at = new Date().toISOString();
    }

    if (data.handoff_to) {
      task.current_agent = data.handoff_to;
    }

    task.metadata.updated_at = new Date().toISOString();
    this.save(task);
  }

  // Write agent output to markdown
  writeAgentOutput(agentName, content) {
    fs.mkdirSync(this.dirPath, { recursive: true });
    const outputPath = path.join(this.dirPath, `${agentName}.md`);
    fs.writeFileSync(outputPath, content);

    const task = this.load();
    if (!task.agents[agentName]) {
      task.agents[agentName] = {};
    }
    task.agents[agentName].output_file = `${agentName}.md`;
    task.metadata.updated_at = new Date().toISOString();
    this.save(task);
  }

  // Append to agent output
  appendAgentOutput(agentName, content) {
    const outputPath = path.join(this.dirPath, `${agentName}.md`);
    fs.appendFileSync(outputPath, '\n' + content);
  }

  // Read agent output
  readAgentOutput(agentName) {
    const outputPath = path.join(this.dirPath, `${agentName}.md`);
    if (!fs.existsSync(outputPath)) return null;
    return fs.readFileSync(outputPath, 'utf8');
  }

  // Mark task as completed
  complete() {
    const task = this.load();
    task.status = 'completed';
    task.current_agent = null;
    task.metadata.updated_at = new Date().toISOString();

    // Calculate actual complexity
    let totalTokens = 0;
    Object.values(task.agents).forEach(agent => {
      if (agent.tokens_used) {
        totalTokens += agent.tokens_used;
      }
    });

    task.complexity.actual_tokens = totalTokens;
    task.complexity.actual = this.mapToFibonacci(totalTokens);

    this.save(task);
  }

  // Map tokens to Fibonacci scale
  mapToFibonacci(tokens) {
    const states = yaml.parse(fs.readFileSync('.agents/states.yml', 'utf8'));
    const scale = states.complexity_scale.values;
    const estimates = states.complexity_scale.token_estimates;

    for (let i = scale.length - 1; i >= 0; i--) {
      if (tokens >= estimates[scale[i]]) {
        return scale[i];
      }
    }
    return scale[0];
  }

  // Find tasks for specific agent
  static findMyTasks(agentName) {
    const tasksDir = '.agents/tasks';
    if (!fs.existsSync(tasksDir)) return [];

    return fs.readdirSync(tasksDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const task = JSON.parse(fs.readFileSync(path.join(tasksDir, f), 'utf8'));
        return task;
      })
      .filter(t => t.current_agent === agentName && t.status === 'in_progress');
  }

  // Cleanup old tasks
  static cleanup(daysOld = 90) {
    const tasksDir = '.agents/tasks';
    const now = Date.now();
    const cutoff = daysOld * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    fs.readdirSync(tasksDir).forEach(file => {
      if (!file.endsWith('.json')) return;

      const filePath = path.join(tasksDir, file);
      const task = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      if (!['completed', 'cancelled'].includes(task.status)) return;

      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > cutoff) {
        fs.unlinkSync(filePath);
        const taskDir = path.join(tasksDir, task.task_id);
        if (fs.existsSync(taskDir)) {
          fs.rmSync(taskDir, { recursive: true });
        }
        cleaned++;
      }
    });

    return cleaned;
  }
}

module.exports = { AgentTask };
```

## 6. Update .gitignore

Add the following rules to `.gitignore`:

```
# Agent Workspace - Local state and dependencies
.agents/tasks/
.agents/retro/
.agents/node_modules/
.agents/package-lock.json
.agents/pnpm-lock.yaml
.agents/bun.lockb

# Keep these files in version control:
# .agents/package.json
# .agents/config.yml
# .agents/states.yml
# .agents/lib.js
# .agents/README.md
```

## 7. Create README (.agents/README.md)

```markdown
# Agent Workspace

This directory contains the Agent-First workflow workspace for this project.

## Structure

- `package.json` - **Dependencies** (yaml package)
- `node_modules/` - **Installed packages** (gitignored)
- `config.yml` - **Dynamic configuration** (initialization time, runtime stats)
- `states.yml` - **State definitions** (task states, agent states, complexity scale)
- `lib.js` - **Agent helper library** (AgentTask class)
- `tasks/` - **Active tasks** (JSON + markdown details, gitignored)
  - `{task-id}.json` - Task state and metadata
  - `{task-id}/` - Detailed agent outputs
    - `planner.md` - Planning documents
    - `coder.md` - Implementation logs
    - `reviewer.md` - Review results
    - `retro.md` - Retrospective analysis
- `retro/` - **Retrospective analysis reports** (gitignored)

## Setup

### First Time Setup
After running `/init-agents`, dependencies are automatically installed. If you clone this repo:

\`\`\`bash
cd .agents
npm install    # or: pnpm install / bun install
\`\`\`

## Task Lifecycle

1. **Create**: `AgentTask.create(taskId, title, complexity)`
2. **Work**: Agents update status and write outputs
3. **Complete**: Mark as done, calculate actual complexity
4. **Cleanup**: Auto-delete after 90 days (based on file mtime)

## Usage Examples

### Create a task
\`\`\`javascript
const { AgentTask } = require('./.agents/lib');
const task = AgentTask.create('LIN-123', 'Implement auth API', 8);
\`\`\`

### Agent updates status
\`\`\`javascript
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'
});
\`\`\`

### Write detailed output
\`\`\`javascript
task.writeAgentOutput('planner', \`
# Planning Document
## Requirements
...
\`);
\`\`\`

### Find my tasks
\`\`\`javascript
const myTasks = AgentTask.findMyTasks('coder');
\`\`\`

### Cleanup old tasks
\`\`\`javascript
const cleaned = AgentTask.cleanup(90); // 90 days
console.log(\`Cleaned \${cleaned} old tasks\`);
\`\`\`

## States

Check `states.yml` for:
- Task states (pending, in_progress, blocked, completed, failed, cancelled)
- Agent states (idle, working, completed, blocked, skipped)
- Complexity scale (Fibonacci: 1, 2, 3, 5, 8, 13, 21, 34, 55, 89)

## Maintenance

Tasks are automatically cleaned up 90 days after completion based on file modification time. No archive directory needed.
```

## Summary

After running this command, your project will have:

✅ **`CLAUDE.md`** - Stable configuration (Task Management System setup)
✅ **`.agents/package.json`** - Dependency manifest (yaml package)
✅ **`.agents/node_modules/`** - Installed packages (gitignored)
✅ **`.agents/config.yml`** - Dynamic state (initialization time, runtime stats)
✅ **`.agents/states.yml`** - State definitions and complexity scale
✅ **`.agents/lib.js`** - Agent helper library
✅ **`.agents/README.md`** - Usage documentation
✅ **`.gitignore`** - Updated to exclude runtime files and dependencies

The workspace is now ready for Agent-First development!

## File Organization Principle

- **`CLAUDE.md`**: Stable configuration that rarely changes (task management type, API connections)
- **`.agents/config.yml`**: Dynamic state that changes during runtime (timestamps, counters)
- **`.agents/states.yml`**: Shared state definitions (task states, complexity scale)
- **`.agents/tasks/`**: Active task data (automatically cleaned after 90 days)

## Next Steps

1. **Understand the workflow**: Read @~/.claude/workflow.md for the complete Agent-First workflow
2. **Technical details**: See @~/.claude/agent-workspace-guide.md for API usage and examples
3. **Start using agents**: Begin with `/product_owner` or `/techlead` commands

## References

- @~/.claude/workflow.md - Complete Agent-First workflow overview
- @~/.claude/agent-workspace-guide.md - Technical implementation guide
- @~/.claude/CLAUDE.md - Global configuration and preferences
