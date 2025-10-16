---
name: approve
description: Review and approve important code changes (API, schema, security) before automatic commit. Critical decision point for quality assurance.
model: opus
---

# Approve Command

**Command Type**: Critical Decision Point
**When to Use**: Review and approve important changes before commit

## Purpose

The `/approve` command is used for manual review of important changes, especially API changes, schema modifications, major refactoring, and other changes requiring explicit approval.

## When to Use

### Required Use Cases for /approve:

1. **API Changes**
   - Add/modify public API endpoints
   - Change API request/response schemas
   - API version upgrades

2. **Database Schema Changes**
   - Add/modify table schemas
   - Database migration scripts
   - Index changes

3. **Major Refactoring**
   - Architecture pattern changes
   - Core module rewrites
   - Major dependency version upgrades

4. **Security Changes**
   - Authentication/authorization mechanism modifications
   - Password handling logic changes
   - Security configuration adjustments

5. **Performance-Critical Changes**
   - Cache strategy changes
   - Database query optimizations
   - Load balancing configuration

### Cases Where /approve is NOT Required:

- Minor bug fixes
- Code comment updates
- Unit test additions
- Documentation updates
- Style adjustments

## Usage

```bash
# Basic usage
/approve

# System will display changes awaiting review
# You need to:
# 1. Review change details
# 2. Decide to approve or reject
# 3. (Optional) Provide review comments
```

## Workflow Integration

### Trigger Point

`@agent-reviewer` automatically prompts for manual review when important changes are detected:

```markdown
🔍 Important Change Detected

**Change Type**: API Schema Modification
**Impact Scope**: POST /auth/login

Manual review required, please run: /approve
```

### Review Process

```mermaid
graph LR
    A[@agent-coder<br/>Complete Implementation] --> B[@agent-reviewer<br/>Automatic Review]
    B --> C{Important<br/>Change<br/>Detected?}

    C -->|Yes| D[🛑 Pause]
    C -->|No| F[✅ Auto Commit]

    D --> E[/approve<br/>Manual Review]
    E --> G{Approved?}

    G -->|Approved| H[@agent-reviewer<br/>Complete Commit]
    G -->|Rejected| I[@agent-coder<br/>Modify]

    I --> B
```

### Review Options

After running `/approve`, you'll see:

```markdown
## Changes Awaiting Review

**Task**: LIN-123 - User Authentication API
**Change Type**: API Schema Modification

### Change Summary

**Modified Files**:
- src/routes/auth.routes.ts
- src/schemas/auth.schema.ts
- docs/api/auth.openapi.yaml

**API Changes**:
```diff
POST /auth/login
- Request: { email, password }
+ Request: { email, password, deviceId }

- Response: { accessToken, refreshToken }
+ Response: { accessToken, refreshToken, sessionId }
```

**Impact Analysis**:
- Breaking Change: ❌ No (backward compatible)
- Frontend Adjustment Needed: ✅ Yes (add deviceId field)
- Documentation Update Needed: ✅ Yes (completed)

---

**Options**:
A) ✅ Approve and commit
B) ❌ Reject with feedback
C) 🔍 View detailed diff
D) 📝 Add review notes and approve

Please select (A/B/C/D):
```

## Response Examples

### Option A: Approve and Commit

```markdown
✅ Changes Approved

@agent-reviewer will execute the following operations:
1. Mark review as passed
2. Create git commit
3. Update task status

Commit message:
feat(LIN-123): add device tracking to auth API

- Add deviceId to login request
- Return sessionId in login response
- Update API documentation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
Reviewed-By: [Your Name]
```

### Option B: Reject with Feedback

```markdown
❌ Changes Rejected

**Review Feedback**:
The deviceId field should be optional, not mandatory.
Suggested schema adjustment:
```typescript
{
  email: string;
  password: string;
  deviceId?: string;  // optional
}
```

Task has been marked for modification, @agent-coder will be notified.
```

### Option C: View Detailed Diff

Displays complete git diff output

### Option D: Add Review Notes and Approve

```markdown
**Review Notes**:
API changes confirmed, but note:
1. Frontend team needs to synchronize updates
2. Legacy mobile app may need backward compatibility handling
3. Recommend notifying users to upgrade in next sprint

Please enter additional review notes (press Enter to complete):
> [Your notes here]

✅ Approved with review notes recorded
```

## Integration with Agent Workspace

Review records are written to the agent workspace:

```javascript
// Approval record written to .agents/tasks/LIN-123/approve.md
const approvalRecord = {
  approved_at: new Date().toISOString(),
  approved_by: 'human',
  change_type: 'api_schema',
  decision: 'approved',
  notes: 'Confirmed with frontend team, backward compatible'
};

task.writeAgentOutput('approve', JSON.stringify(approvalRecord, null, 2));
```

## Best Practices

1. **Carefully Review Impact Analysis**: Confirm if breaking changes exist
2. **Verify Test Coverage**: Important changes must have comprehensive tests
3. **Check Documentation Sync**: API changes must update documentation
4. **Consider Backward Compatibility**: Assess impact on existing clients
5. **Document Review Feedback**: Leave review records for future reference

## Key Constraints

- **Only Human**: This command is for human use only, agents cannot execute it
- **Blocking**: Task will pause until review is complete
- **Required for Critical Changes**: Important changes must go through this process
- **Audit Trail**: All review records are preserved

## References

- @~/.claude/workflow.md - Complete workflow
- @~/.claude/agents/reviewer.md - Reviewer agent
- @~/.claude/CLAUDE.md - Global configuration
