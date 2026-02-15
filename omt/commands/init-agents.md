---
name: init-agents
description: Initialize Agent-First workflow structure in the current project. Sets up agent workspace, task management, and configuration.
model: claude-haiku-4-5
---

# Init Agents Workspace

Initialize Agent-First workflow structure in the current project.

## What this command does

1. Creates `.agents/` directory structure (workspace + `.state/` infrastructure)
2. Configures task management system (Linear/GitHub Issues/Jira/Local)
3. Updates `.gitignore` rules
4. Creates project `CLAUDE.md` with configuration

## Usage

Run this command in any project root to set up the agent workspace.

---

## Step 1: Task Management System Configuration

Ask the user which task management system to use:

```
AskUserQuestion({
  questions: [{
    question: "Which task management system does this project use?",
    header: "Task Mgmt",
    options: [
      { label: "Linear", description: "Linear with MCP integration" },
      { label: "GitHub Issues", description: "GitHub repository issue tracking" },
      { label: "Jira", description: "Atlassian Jira project management" },
      { label: "Local files", description: "Local task tracking in .agents/.state/tasks/" }
    ],
    multiSelect: false
  }]
});
```

Store the user's selection as `$TASK_MGMT` (one of: `linear`, `github`, `jira`, `local`).

### If Linear:

Ask for team/workspace details:
```
AskUserQuestion({
  questions: [{
    question: "What is your Linear team name or ID?",
    header: "Linear Team",
    options: [
      { label: "Skip", description: "Configure later" }
    ],
    multiSelect: false
  }]
});
```

### If GitHub Issues:

Detect from git remote if possible, otherwise ask:
```bash
git remote get-url origin 2>/dev/null
```

### If Jira:

Ask for project key and site URL.

## Step 2: Initialize Workspace

Run the CLI to create the workspace structure:

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/bin/cli.ts init --task-mgmt $TASK_MGMT
```

This creates:
- `.agents/` — clean development workspace
- `.agents/outputs/` — agent output files
- `.agents/.state/` — gitignored infrastructure (config, state files, tasks)
- `.agents/.gitignore` — ignores `.state/`

## Step 3: Update Project .gitignore

Check if `.gitignore` already has `.agents` rules. If not, append:

```
# Agent Workspace
.agents/.state/
```

**Important**: Only add rules that aren't already present.

## Step 4: Create Project CLAUDE.md

If `CLAUDE.md` does not exist in the project root, create it. If it already exists, append the agent workspace section.

Content to add:

```markdown
# Project Configuration

## Task Management System

**System**: [Linear/GitHub/Jira/Local]
**Configuration**:
- [Key configuration details based on selection]

## Agent Workspace

Location: `.agents/`

### Structure
```
.agents/
├── .gitignore          # Ignores .state/
├── goal.md             # Human-defined goal
├── outputs/            # Agent output files
│   ├── pm.md           # @pm requirements
│   ├── arch.md         # @arch architecture
│   ├── dev.md          # @dev execution report
│   └── hive.md         # @hive completion report
└── .state/             # Infrastructure (gitignored)
    ├── config.json     # Workspace configuration
    ├── state.json      # Task state
    ├── hive-state.json # @hive lifecycle state
    └── tasks/          # Task tracking data
```
```

## Step 5: Report Completion

Display to the user:

```
Agent workspace initialized.

  .agents/           — Development workspace
  .agents/outputs/   — Agent output files
  .agents/.state/    — Infrastructure (gitignored)
  Task management:   $TASK_MGMT

Next steps:
  /omt "your goal"   — Launch autonomous workflow
  /help              — View command reference
```

## Summary

After running this command, the project will have:

- `.agents/` directory with clean workspace structure
- `.agents/.state/` with config and state files (gitignored)
- Updated `.gitignore`
- `CLAUDE.md` with task management configuration

The workspace is ready for Agent-First development with `/omt`.
