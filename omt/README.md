# OMT - One Man Team Plugin

A comprehensive Agent-First development workflow system for Claude Code, featuring 9 autonomous agents, intelligent task management, and automated quality assurance. Your personal development squad that makes one person feel like a team.

## Overview

**OMT (One Man Team)** transforms your development workflow by introducing an **Agent-First** approach where:
- **Agents handle complex automation** - Autonomous execution of multi-step tasks
- **Commands are for critical decisions** - Human input only at key decision points
- **Quality is built-in** - Automated code review, testing, and git commit workflows

## Features

### 🤖 9 Specialized Agents

- **@agent-planner**: Task decomposition and PRD generation
- **@agent-coder**: TDD implementation with test-first approach
- **@agent-reviewer**: Code quality review + automatic git commits
- **@agent-debugger**: Systematic error diagnosis and fixes
- **@agent-optimizer**: Performance optimization and refactoring
- **@agent-doc**: Documentation generation and maintenance
- **@agent-devops**: Deployment configuration and infrastructure
- **@agent-pm**: Project management and status tracking
- **@agent-retro**: Retrospective analysis and estimation improvement

### 📋 Task Management Integration

- **Linear**: Full MCP integration with workflow automation
- **GitHub Issues**: Native integration
- **Jira**: API-based synchronization
- **Local Files**: Self-contained task management

### 🎯 Critical Decision Commands

- `/po` (Product Owner): Define requirements and features
- `/techlead`: Make architectural decisions
- `/approve`: Review important changes (API, schema, security)
- `/git-commit`: Manual git commits (emergency only)
- `/init-agents`: Initialize agent workspace

### 🔄 Automated Workflow

```
/po → /techlead → @agent-planner → @agent-coder → @agent-reviewer → (auto commit)
                                          ↓
                                    @agent-debugger (if needed)
                                          ↓
                                    @agent-optimizer (if needed)
```

### 📊 Fibonacci Complexity Estimation

- Token-based complexity (1 point = 1000 tokens)
- Fibonacci scale: 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
- Continuous learning through @agent-retro

### 🛡️ Failure Protection

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
- Configure task management system (Linear/GitHub/Jira/Local)
- Initialize state definitions and helper library
- Update `.gitignore` rules

## Usage

### Quick Start

```bash
# 1. Define requirements
/po "Implement user authentication system"

# 2. Make architecture decisions
/techlead

# 3. Agents automatically execute
# - @agent-planner breaks down tasks
# - @agent-coder implements with TDD
# - @agent-reviewer reviews and commits
# - @agent-pm updates task management
```

### Example: Bug Fix

```bash
# Fully automated
@agent-debugger "Fix login 500 error"
# → Diagnoses issue
# → Hands off to @agent-coder
# → @agent-reviewer reviews and commits
```

### Example: Performance Optimization

```bash
@agent-optimizer "Optimize API response time"
# → Analyzes bottlenecks
# → Implements optimizations
# → @agent-reviewer validates and commits
```

## Git Workflow

### Commit Authority

**✅ Has commit authority:**
- `@agent-reviewer` (automatic after review)
- `/git-commit` (manual, emergency only)

**❌ No commit authority:**
- All other agents
- Agents create code changes but cannot commit

### Commit Format

```
<type>[optional scope]: <description>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Agent Workspace

### Structure

```
.agents/
├── package.json           # Dependencies (yaml)
├── config.yml            # Dynamic runtime state
├── states.yml            # State definitions
├── lib.js               # Helper library (AgentTask class)
├── tasks/               # Active tasks (gitignored)
│   ├── LIN-123.json    # Task state
│   └── LIN-123/        # Agent outputs
│       ├── planner.md
│       ├── coder.md
│       └── reviewer.md
└── retro/              # Retrospective analysis (gitignored)
```

### Task Lifecycle

1. **Create**: `AgentTask.create(taskId, title, complexity)`
2. **Work**: Agents update status and write outputs
3. **Handoff**: Automatic agent-to-agent task transfer
4. **Complete**: Calculate actual complexity
5. **Cleanup**: Auto-delete after 90 days (based on file mtime)

### API Example

```javascript
const { AgentTask } = require('./.agents/lib');

// Create task
const task = AgentTask.create('LIN-123', 'Implement auth API', 8);

// Agent updates
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'
});

// Write detailed output
task.writeAgentOutput('planner', '# PRD\n...');

// Find my tasks
const myTasks = AgentTask.findMyTasks('coder');

// Complete task
task.complete();
```

## Configuration

### Task Management (in project CLAUDE.md)

```markdown
## Task Management System

**System**: Linear
**Configuration**:
- Team ID: TEAM-ABC
- Workspace: my-workspace
```

### Agent Behavior (in .agents/config.yml)

```yaml
workspace:
  version: "1.0.0"
  location: ".agents/"

task_management:
  system: "Linear"
```

## Best Practices

### 1. Agent-First Priority

- ✅ Complex tasks → Use agents
- ✅ Automation → Use agents
- ⚠️ Critical decisions → Use commands

### 2. Complexity Estimation

- Based on token consumption, not human hours
- Use Fibonacci scale
- Let @agent-retro improve estimates

### 3. Workspace Maintenance

```bash
# Cleanup old tasks (90 days)
cd .agents
node -e "require('./lib').AgentTask.cleanup(90)"
```

### 4. Monitor Progress

```bash
# View task status
cat .agents/tasks/LIN-123.json | jq

# View agent output
cat .agents/tasks/LIN-123/coder.md

# View retro analysis
cat .agents/retro/*.md
```

## Troubleshooting

### Agent Not Finding Tasks

Check `current_agent` field:
```bash
cat .agents/tasks/LIN-123.json | jq '.current_agent'
```

### Task State Issues

Verify state definitions:
```bash
cat .agents/states.yml
```

### Workspace Size

Monitor and cleanup:
```bash
du -sh .agents/
node -e "require('./.agents/lib').AgentTask.cleanup(30)"
```

## Advanced Topics

### Custom Agents

Extend the system by creating new agents in `~/.claude/agents/`.

### Integration with CI/CD

Agents can trigger builds and deployments via @agent-devops.

### Team Workflows

Configure plugins at repository level via `.claude/settings.json`.

## Documentation

- **Workflow Overview**: See plugin's `docs/workflow.md`
- **Workspace Guide**: See plugin's `docs/agent-workspace-guide.md`
- **Command Reference**: See `commands/` directory
- **Agent Specifications**: See `agents/` directory

## License

MIT License

## Support

For issues and feedback:
- GitHub Issues: https://github.com/musingfox/cc-plugins/issues
- Documentation: Plugin installation includes complete docs

---

**Version**: 1.0.0
**Last Updated**: 2025-10-16
**Status**: Production Ready
