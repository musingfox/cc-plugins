---
name: help
description: Comprehensive guide to Agent-First workflow including all 9 agents, 6 commands, best practices, and workflow examples
model: haiku
---

# Agent-First Workflow - Complete Guide

## 🎯 Quick Overview

The **Agent-First Workflow** is a collaborative development system where:
- **Humans** make critical decisions via 2 commands (`/po`, `/techlead`)
- **Agents** autonomously execute complex work
- **Quality** is built-in with automated code review and git commits

## 📊 Workflow Diagram

```
/po (Define Requirements)
    ↓
/techlead (Architecture Decisions)
    ↓
@agent-planner (Task Breakdown + PRD)
    ↓
@agent-coder (TDD Implementation)
    ↓
@agent-reviewer (Code Review + Auto Commit)
    ↓
@agent-pm (Project Management)
    ↓
@agent-retro (Retrospective Analysis)
```

**Error Path**:
- `@agent-debugger` → diagnoses issues → hands off to `@agent-coder`

**Optimization Path**:
- `@agent-optimizer` → optimizes code → hands off to `@agent-reviewer`

---

## 🚀 Getting Started (3 Steps)

### Step 1: Initialize Agent Workspace

In your project root, run:
```bash
/init-agents
```

This creates:
- `.agents/` directory structure
- Task management configuration (Linear/GitHub/Jira/Local)
- Helper library and state definitions

### Step 2: Define Your Requirements

```bash
/po "Your feature description"
```

Example:
```bash
/po "Implement user authentication with JWT and refresh tokens"
```

**You decide**:
- Feature scope and acceptance criteria
- Priority and timeline
- Success metrics

### Step 3: Architecture Decisions (Optional but Recommended)

```bash
/techlead
```

**You decide**:
- Technology stack
- Architecture patterns
- Integration points
- Risk assessment

**Result**: Everything else happens automatically!

---

## 🎮 Commands (Critical Decision Points)

### `/po` - Product Owner
**When**: Project start or new feature planning
**Input**: Feature description and requirements
**Output**: Automatically triggers task breakdown

Example:
```bash
/po "Implement OAuth2 social login integration"
```

### `/techlead` - Technology Decisions
**When**: Major architectural or technology changes
**Input**: Tech stack and architecture preferences
**Output**: Architecture-informed task planning

### `/approve` - Review Important Changes
**When**: API changes, schema modifications, security updates
**Input**: Review and approve/reject changes
**Output**: Automatic commit after approval

### `/git-commit` - Manual Commit (Emergency)
**When**: Manual intervention needed
**Input**: Commit message
**Output**: Direct git commit

### `/init-agents` - Initialize Workspace
**When**: New project setup
**Execution**: Sets up complete agent infrastructure

---

## 🤖 Agents (Autonomous Execution)

### 1. @agent-planner
**Role**: Task Breakdown & PRD Generation
**Trigger**: After `/po` and `/techlead` commands
**Output**: Detailed PRD with task breakdown
**Handoff**: → `@agent-coder`

**Responsibilities**:
- Analyze requirements
- Create detailed PRD (Product Requirements Document)
- Break down into subtasks
- Estimate complexity (Fibonacci scale)

**Sample Output** (planner.md):
```markdown
# PRD: User Authentication

## Requirements
- JWT token generation
- Refresh token mechanism
- Rate limiting

## Task Breakdown
- [ ] Token service (3 points)
- [ ] Auth middleware (2 points)
- [ ] Rate limiting (2 points)
- [ ] Tests (1 point)

Total Complexity: 8 points
```

### 2. @agent-coder
**Role**: TDD Implementation
**Trigger**: After planner completes
**Output**: Tested, working code
**Handoff**: → `@agent-reviewer`

**Responsibilities**:
- Write tests first (TDD approach)
- Implement features
- Ensure tests pass
- Document code inline

**Best For**:
- Feature implementation
- Bug fixes
- Refactoring

**Sample Output** (coder.md):
```markdown
# Implementation Progress

## Completed Tasks
- ✅ Token service (2500 tokens)
- ✅ Auth middleware (1800 tokens)
- ✅ All tests passing

## Remaining
- [ ] Integration tests

Total tokens used: 4300
```

### 3. @agent-reviewer
**Role**: Code Quality Review + Git Commit Authority
**Trigger**: After coder completes
**Output**: Approved code with commit
**Handoff**: → `@agent-pm`

**Responsibilities**:
- Review code quality
- Verify test coverage
- Check documentation
- **Auto commit** approved code
- Enforce coding standards

**Approval Criteria**:
- All tests passing
- Code quality standards met
- Documentation complete
- Security review passed

### 4. @agent-debugger
**Role**: Error Diagnosis & Troubleshooting
**Trigger**: Manual call when issues arise
**Output**: Identified root cause & fix
**Handoff**: → `@agent-coder`

**Responsibilities**:
- Diagnose errors systematically
- Identify root causes
- Suggest fixes
- Prevent recurring issues

**Usage**:
```bash
@agent-debugger "Fix login 500 error"
# → Diagnoses issue
# → Hands to @agent-coder for fix
# → @agent-reviewer reviews
# → Auto commit
```

### 5. @agent-optimizer
**Role**: Performance Optimization
**Trigger**: Manual call for performance improvements
**Output**: Optimized code
**Handoff**: → `@agent-reviewer`

**Responsibilities**:
- Identify performance bottlenecks
- Optimize algorithms
- Reduce resource usage
- Maintain functionality

**Optimization Targets**:
- Response time
- Memory usage
- Database queries
- Code complexity

### 6. @agent-doc
**Role**: Documentation Generation
**Trigger**: After code is reviewed
**Output**: Complete documentation
**Handoff**: Completes independently

**Responsibilities**:
- Generate API documentation
- Create user guides
- Update README
- Add code comments

**Generates**:
- API reference
- Usage examples
- Architecture diagrams
- Troubleshooting guides

### 7. @agent-devops
**Role**: Deployment Configuration
**Trigger**: After code review
**Output**: Deployment-ready config
**Handoff**: Completes independently

**Responsibilities**:
- Prepare deployment configurations
- Set up CI/CD pipelines
- Configure environment variables
- Create deployment scripts

**Handles**:
- Docker/container setup
- Infrastructure as Code
- Deployment automation
- Environment management

### 8. @agent-pm
**Role**: Project Management & Completion
**Trigger**: After code review + commit
**Output**: Project status report
**Handoff**: → `@agent-retro`

**Responsibilities**:
- Update task management system
- Track project progress
- Coordinate agent handoffs
- Trigger retrospective analysis

**Integration**:
- Linear issue updates
- GitHub milestone tracking
- Progress reporting
- Capacity planning

### 9. @agent-retro
**Role**: Retrospective Analysis & Learning
**Trigger**: After task completion
**Output**: Insights and improvements
**Handoff**: Updates PM with findings

**Responsibilities**:
- Analyze estimation accuracy
- Calculate actual complexity
- Identify lessons learned
- Improve future predictions

**Generates**:
```markdown
# Retrospective Analysis - LIN-123

## Estimation Accuracy
- Estimated: 8 points
- Actual: 10 points
- Accuracy: 80%

## Lessons Learned
- Auth implementation more complex than expected
- Token management requires more edge cases

## Recommendations
- Add 20% buffer for auth tasks in future
- Create auth helper library for reuse
```

---

## 🔄 Complete Workflow Example

### Scenario: Implement Payment Processing

```bash
# Step 1: Define Requirements
/po "Implement Stripe payment processing with webhook support"

# Step 2: Technology Decisions
/techlead
# → User selects: Node.js, Express, Stripe API, PostgreSQL

# Step 3-7: Fully Automated
# @agent-planner
#   ↓ Creates PRD with 4-5 subtasks
# @agent-coder
#   ↓ Implements payment service (TDD)
# @agent-reviewer
#   ↓ Reviews and commits
# @agent-pm
#   ↓ Updates Linear issue
# @agent-retro
#   ↓ Analyzes and reports

# Result: Feature complete with commit history!
```

---

## 📚 Task Management Integration

### Supported Systems

**Local Files**:
- Tasks in `.agents/tasks/`
- No external dependency
- Best for solo projects

**Linear**:
- Full MCP integration
- Status synchronization
- Team collaboration

**GitHub Issues**:
- Native integration
- Automatic linking
- Built-in CI/CD

**Jira**:
- API-based sync
- Enterprise support
- Sprint tracking

### Configuration

During `/init-agents`, choose your system:
```
Choose task management:
A) Local files
B) Linear
C) GitHub Issues
D) Jira
```

---

## 🏗️ Workspace Structure

After `/init-agents`, your project has:

```
.agents/
├── package.json              # Dependencies (yaml)
├── config.yml               # Configuration
├── states.yml               # State definitions
├── lib.js                   # Helper library
├── tasks/                   # Task data (gitignored)
│   ├── LIN-123.json        # Task state
│   └── LIN-123/
│       ├── planner.md      # Planner output
│       ├── coder.md        # Coder output
│       └── reviewer.md     # Review results
└── retro/                   # Retrospectives (gitignored)
```

---

## 📊 Complexity Estimation (Fibonacci Scale)

Tasks are estimated using token consumption, not human hours:

| Points | Tokens | Description |
|--------|--------|-------------|
| 1 | 1,000 | Trivial task |
| 2 | 2,000 | Simple feature |
| 3 | 3,000 | Basic feature |
| 5 | 5,000 | Medium feature |
| 8 | 8,000 | Complex feature |
| 13 | 13,000 | Very complex |
| 21 | 21,000 | Large feature set |

**Key Principle**: Let `@agent-retro` improve estimates based on actual usage.

---

## 🛡️ Error Handling & Protection

### Automatic Escalation

When an agent encounters issues:

1. **Retry up to 3 times** for transient errors
2. **Fallback strategy** for known issues
3. **Escalate to human** if unresolvable

Example:
```bash
# Agent tries 3 times, then alerts:
🚨 Agent needs help: Test failures after 3 retries

Current state:
- Stashed changes: stash@{0}
- Diagnostic: .agents/tasks/LIN-123/coder.md

Options:
A) Review failure details
B) Manually fix issue
C) Adjust requirements
```

### State Preservation

- Git stashes are created before risky operations
- Checkpoints saved between agent handoffs
- Complete audit trail in task JSON

---

## 🎓 Best Practices

### 1. Agent-First Priority

**Use Agents for**:
- ✅ Complex multi-step tasks
- ✅ Automation and repetition
- ✅ Consistent quality

**Use Commands for**:
- ✅ Critical decisions only
- ✅ Direction-setting
- ✅ Approval gates

### 2. Complexity Estimation

- Based on token consumption, not guesses
- Let `@agent-retro` continuously improve
- Use historical data for better predictions

### 3. Workspace Maintenance

```bash
# Check workspace size
du -sh .agents/

# View task status
cat .agents/tasks/LIN-123.json | jq

# View agent output
cat .agents/tasks/LIN-123/coder.md

# Clean old tasks (90+ days)
node -e "require('./.agents/lib').AgentTask.cleanup(90)"
```

### 4. Git Workflow

Only 2 entities can commit:
- ✅ `@agent-reviewer` - after review
- ✅ `/git-commit` - manual (emergency only)

**Commit Format**:
```
feat(LIN-123): implement payment processing

Add Stripe integration with webhook support

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 🚦 Workflow Variations

### Quick Feature Development

```bash
/po "Feature: Add dark mode toggle"
# → Auto-completes in 1-2 passes
```

### Bug Fix with Investigation

```bash
@agent-debugger "Fix: Memory leak in user session"
# → Diagnosis → Fix → Review → Commit
```

### Performance Optimization

```bash
@agent-optimizer "Reduce API response time by 50%"
# → Analysis → Optimization → Testing → Commit
```

### Documentation Update

```bash
@agent-doc "Generate API docs for new endpoints"
# → Analyzes code → Generates docs
```

---

## 📖 Learning Resources

### Documentation

Inside this plugin:
- `docs/workflow.md` - Complete workflow overview
- `docs/agent-workspace-guide.md` - Technical implementation guide
- `commands/` directory - Individual command details
- `agents/` directory - Agent specifications

### Quick References

**Initialize workspace**:
```bash
/init-agents
```

**View workspace guide**:
See plugin's `docs/agent-workspace-guide.md`

**Check agent status**:
```bash
cat .agents/tasks/LIN-123.json | jq
```

---

## ❓ FAQ

**Q: Do I need to run all commands?**
A: No! Start with `/po`, optionally use `/techlead`, then agents handle the rest.

**Q: Can I use this without task management?**
A: Yes! Choose "Local files" during `/init-agents` setup.

**Q: What if an agent fails?**
A: It escalates with full context. You can then manually fix or adjust requirements.

**Q: How do I monitor progress?**
A: Check `.agents/tasks/` directory - each task shows all agent outputs.

**Q: Can agents commit code?**
A: Only `@agent-reviewer` can commit. Other agents create code, reviewer approves.

---

## 🔗 Related Resources

- Full documentation: See `docs/` directory
- Individual agents: See `agents/` directory
- Command details: See `commands/` directory
- Workspace setup: Run `/init-agents`

---

**Version**: 1.0
**Last Updated**: 2025-10-16
**Status**: Production Ready

Need more details? Check the comprehensive guides in the `docs/` directory!
