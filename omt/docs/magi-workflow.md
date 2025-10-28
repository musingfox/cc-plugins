# MAGI Review System - Workflow Guide

## Overview

This guide explains how to use the MAGI (Multi-Angle Generative Intelligence) Review System in your daily development workflow. The MAGI system provides comprehensive code review through three specialized perspectives, inspired by the MAGI supercomputer from Neon Genesis Evangelion.

## Quick Start

### Basic Usage

The MAGI system is now integrated into the standard OMT workflow. When code implementation is complete, the review process automatically leverages the MAGI system:

```
User request → @agent-planner → @agent-coder → @agent-magi → @agent-reviewer → @agent-pm
```

**No changes needed** - The MAGI system activates automatically when `@agent-reviewer` receives code from `@agent-coder`.

### Manual Invocation

You can also manually invoke MAGI review:

```
@agent-magi please review the current changes
```

## The Three MAGI Reviewers

### MELCHIOR - Technical Reviewer (科學家視角)

**Focus**: Technical excellence, code quality, security, performance

**Reviews**:
- Code quality and clean code principles
- Architecture and design patterns
- Performance and optimization
- Security vulnerabilities
- Test coverage (unit, integration, E2E)

**Example Concerns**:
- "Cyclomatic complexity of 18 exceeds threshold of 15 in function calculatePrice"
- "SQL injection vulnerability in user search endpoint"
- "Unit test coverage at 87%, below 90% threshold"

### BALTHASAR - Product Reviewer (母親視角 - 關懷用戶)

**Focus**: User value, requirements compliance, user experience

**Reviews**:
- PRD requirements fulfillment
- User experience and usability
- Functional correctness
- API contract compliance
- End-to-end user journeys

**Example Concerns**:
- "PRD requirement 3.2 'Remember me' feature not implemented"
- "Error message shows technical details instead of user-friendly text"
- "Login E2E test failing - users cannot complete authentication flow"

### CASPER - Maintenance Reviewer (務實視角)

**Focus**: Long-term maintainability, documentation, team collaboration

**Reviews**:
- Code readability and maintainability
- Documentation completeness
- Team coding standards compliance
- Technical debt assessment
- Knowledge sharing and onboarding

**Example Concerns**:
- "New API endpoint has no JSDoc documentation"
- "Variable names 'x', 'tmp', 'data1' are unclear"
- "12 ESLint violations - inconsistent code style"

## Workflow Scenarios

### Scenario 1: Normal Feature Development (Auto-Approval)

**Flow**:
```
1. @agent-coder: "Feature implementation complete"
2. @agent-reviewer: Hands off to @agent-magi
3. @agent-magi: Spawns three reviewers in parallel
4. Reviews complete:
   - MELCHIOR: ✅ APPROVE - Code quality excellent, 95% coverage
   - BALTHASAR: ✅ APPROVE - All PRD requirements met
   - CASPER: ✅ APPROVE - Well documented, follows standards
5. @agent-magi: "UNANIMOUS APPROVAL" → @agent-reviewer
6. @agent-reviewer: Creates git commit
7. @agent-pm: Generates completion report
```

**User Experience**: Seamless, automatic - no intervention needed

### Scenario 2: Mixed Reviews (Manual Review Required)

**Flow**:
```
1. @agent-coder: "API endpoint changes complete"
2. @agent-reviewer: Hands off to @agent-magi
3. @agent-magi: Spawns three reviewers
4. Reviews complete:
   - MELCHIOR: ✅ APPROVE - Technical quality good
   - BALTHASAR: 🔧 REQUEST_CHANGES - Breaking API change detected
   - CASPER: ✅ APPROVE - Documentation complete
5. @agent-magi: "SPLIT DECISION - Manual review required"
6. System: "Please run /approve to review BALTHASAR's concerns"
7. User runs /approve and reviews
8. User decides: Accept or request changes
```

**User Experience**: Prompted for decision when perspectives conflict

### Scenario 3: Critical Issues (Rejection)

**Flow**:
```
1. @agent-coder: "Quick fix implemented"
2. @agent-reviewer: Hands off to @agent-magi
3. @agent-magi: Spawns three reviewers
4. Reviews complete:
   - MELCHIOR: ❌ REJECT - SQL injection vulnerability
   - BALTHASAR: ✅ APPROVE - Functionality works
   - CASPER: ⚠️ APPROVE_WITH_CONCERNS - Missing docs
5. @agent-magi: "REJECTION - Critical security issue"
6. @agent-magi: Hands back to @agent-coder
7. @agent-coder: Fixes security issue
8. Process repeats from step 1
```

**User Experience**: Clear indication of critical issues, automatic routing back to coder

### Scenario 4: Emergency Bypass

**Flow**:
```
1. User: "Emergency hotfix needed, skip MAGI review"
2. @agent-coder: Implements hotfix
3. @agent-reviewer: Uses Direct Mode (bypasses MAGI)
4. @agent-reviewer: Performs quick comprehensive review
5. @agent-reviewer: Creates git commit if passes
6. @agent-pm: Generates completion report
```

**User Experience**: Fast-track for emergencies

## Commands

### Standard Commands

**No new commands required** - MAGI integrates seamlessly into existing workflow

### Optional Commands (for Advanced Usage)

```bash
# View last MAGI review report
/magi-report

# View MAGI decision history
/magi-history

# View MAGI statistics (approval rates, etc.)
/magi-stats

# Skip MAGI review (emergency bypass)
/skip-magi
```

**Note**: These commands are optional and documented here for future implementation.

## Understanding MAGI Decisions

### Decision Types

| Decision | Meaning | Next Step |
|----------|---------|-----------|
| **AUTO_APPROVE** | All reviewers approve or have minor concerns only | Automatic git commit |
| **MANUAL_REVIEW** | Mixed opinions, human judgment needed | User runs `/approve` |
| **REQUEST_CHANGES** | Multiple reviewers want changes | Code goes back to @agent-coder |
| **REJECT** | Critical issues found | Code goes back to @agent-coder |

### Vote Combinations

| MELCHIOR | BALTHASAR | CASPER | Result |
|----------|-----------|--------|--------|
| ✅ APPROVE | ✅ APPROVE | ✅ APPROVE | AUTO_APPROVE |
| ✅ APPROVE | ✅ APPROVE | ⚠️ CONCERNS | AUTO_APPROVE |
| ✅ APPROVE | ⚠️ CONCERNS | ⚠️ CONCERNS | AUTO_APPROVE |
| ⚠️ CONCERNS | ⚠️ CONCERNS | ⚠️ CONCERNS | MANUAL_REVIEW |
| ✅ APPROVE | 🔧 CHANGES | ✅ APPROVE | MANUAL_REVIEW |
| 🔧 CHANGES | 🔧 CHANGES | * | REQUEST_CHANGES |
| ❌ REJECT | * | * | REJECT |

### Reading MAGI Reports

**Example Report**:
```markdown
# MAGI Review Report

## Decision: AUTO_APPROVE

## Consensus Summary
- **MELCHIOR** (Technical): ✅ APPROVE - Excellent code quality, 95% test coverage
- **BALTHASAR** (Product): ✅ APPROVE - All PRD requirements met, great UX
- **CASPER** (Maintenance): ⚠️ APPROVE_WITH_CONCERNS - Minor: Could use more inline comments

## Overall Assessment
Implementation is solid across all dimensions. Code is technically sound, meets all
product requirements, and is well-documented. CASPER noted that a few complex
functions could benefit from additional inline comments, but this is non-blocking.

## Minor Notes
1. Consider adding comments to explain algorithm in calculateOptimalRoute() (src/router.ts:145)

## Next Steps
Proceeding with git commit.
```

## Best Practices

### For Developers

**1. Write Clean, Well-Tested Code**
- Keep MELCHIOR happy with clean code and good tests
- Keep BALTHASAR happy by meeting PRD requirements
- Keep CASPER happy with good documentation

**2. Address All Three Perspectives**
When implementing features, consider:
- ✅ Technical: Is it clean, secure, performant?
- ✅ Product: Does it meet requirements and serve users?
- ✅ Maintenance: Can the team maintain this?

**3. Learn from MAGI Feedback**
- MAGI feedback is educational - read it even when approved
- Patterns in concerns indicate areas for improvement
- Use feedback to improve before next implementation

### For Teams

**1. Trust the System**
- MAGI unanimous approval means code is ready
- Manual review requests are genuine edge cases
- Don't bypass MAGI unless truly urgent

**2. Track Patterns**
- Monitor MAGI statistics over time
- Identify common concerns by reviewer
- Adjust team practices based on patterns

**3. Customize as Needed**
- Adjust coverage thresholds per project needs
- Configure reviewer weights for project priorities
- Add project-specific checks to reviewers

## Configuration

### Project-Level Settings

Create `.omt/magi-config.yml` to customize:

```yaml
# Coverage thresholds
coverage:
  unit: 90%
  integration: 80%
  e2e: critical_paths

# Reviewer weights (must sum to 1.0)
weights:
  melchior: 0.35  # Technical
  balthasar: 0.35 # Product
  casper: 0.30    # Maintenance

# Auto-approve settings
auto_approve:
  unanimous_only: false  # true = require all 3 approve
  max_concerns: 2        # Max concerns before manual review

# Bypass settings
bypass:
  allow_skip_magi: true  # Allow /skip-magi command
  require_reason: true   # Require reason for bypass
```

**Note**: Configuration file support is planned for future implementation.

## Troubleshooting

### Issue: MAGI taking too long

**Possible Causes**:
- Large code changes (many files)
- Slow test execution
- Network issues

**Solutions**:
- Break changes into smaller chunks
- Optimize slow tests
- Check connectivity

### Issue: Conflicting reviewer opinions

**Example**: MELCHIOR says code is secure, BALTHASAR says security issue

**Resolution**:
- This triggers MANUAL_REVIEW automatically
- Human judgment required
- Conservative approach: Follow most cautious opinion

### Issue: Too many manual reviews requested

**Possible Causes**:
- Code quality inconsistent
- Requirements ambiguous
- Team standards not well-defined

**Solutions**:
- Review MAGI statistics to identify patterns
- Address common concerns in coding guidelines
- Clarify ambiguous requirements in PRD

### Issue: Want to bypass MAGI for hotfix

**Solution**:
- Option 1: Ask @agent-reviewer to skip MAGI
- Option 2: Use `/skip-magi` (if implemented)
- Remember: This should be rare, only for emergencies

## Examples

### Example 1: Perfect Implementation

```
User: "Implement user authentication with JWT"

@agent-planner: Creates plan
@agent-coder: Implements feature with:
  - Clean code
  - 96% test coverage
  - All PRD requirements
  - Complete documentation
  - Follows team standards

@agent-magi: Reviews
  MELCHIOR: ✅ APPROVE - Excellent implementation
  BALTHASAR: ✅ APPROVE - All requirements met
  CASPER: ✅ APPROVE - Well documented

Result: AUTO_APPROVE → Automatic commit

User: Sees completion report, feature is done
```

### Example 2: Security Issue

```
User: "Add search feature"

@agent-coder: Implements search, but uses string concatenation for SQL

@agent-magi: Reviews
  MELCHIOR: ❌ REJECT - SQL injection vulnerability
  BALTHASAR: ✅ APPROVE - Search works well
  CASPER: ✅ APPROVE - Code is readable

Result: REJECT → Back to @agent-coder

@agent-coder: Fixes SQL injection
@agent-magi: Reviews again → AUTO_APPROVE

User: Sees completion report with security fix noted
```

### Example 3: API Breaking Change

```
User: "Update user API"

@agent-coder: Changes API response format (breaking change)

@agent-magi: Reviews
  MELCHIOR: ✅ APPROVE - Code quality good
  BALTHASAR: 🔧 REQUEST_CHANGES - Breaking change, need migration plan
  CASPER: ✅ APPROVE - Well documented

Result: MANUAL_REVIEW

System: "Please run /approve - BALTHASAR flagged breaking change"

User: Runs /approve, reviews concern
User: Agrees with BALTHASAR, asks for migration guide

@agent-coder: Adds migration guide
@agent-magi: Reviews again → AUTO_APPROVE
```

## Integration with Existing Workflow

### OMT Workflow (Before MAGI)

```
User Request
    ↓
@agent-planner (create plan)
    ↓
@agent-coder (implement)
    ↓
@agent-reviewer (review & commit)
    ↓
@agent-pm (report)
```

### OMT Workflow (After MAGI)

```
User Request
    ↓
@agent-planner (create plan)
    ↓
@agent-coder (implement)
    ↓
@agent-magi (3-way review)      ← NEW
    ├─ MELCHIOR (technical)
    ├─ BALTHASAR (product)
    └─ CASPER (maintenance)
    ↓
@agent-reviewer (commit if approved)
    ↓
@agent-pm (report)
```

**Key Change**: One additional step between coder and reviewer
**Impact**: More thorough review, same or better speed (parallel execution)

## Advanced Topics

### Custom Reviewers

Projects can add custom MAGI reviewers for specialized needs:

**Example**: Security-focused project
```
@agent-magi-security (Security Specialist)
- Focus: Deep security analysis
- Integrates as 4th reviewer
- Veto power on security issues
```

**Note**: Custom reviewers are an advanced feature for future implementation.

### Machine Learning Integration

MAGI can learn from past reviews:
- Track false positives (approved manually after REJECT)
- Track false negatives (issues found after AUTO_APPROVE)
- Adjust sensitivity based on project patterns
- Learn team-specific preferences

**Note**: ML integration is planned for future implementation.

### CI/CD Integration

MAGI can integrate with CI/CD:
- Run MAGI review on pull requests
- Block merge if REJECT decision
- Auto-merge if AUTO_APPROVE
- Require manual approval if MANUAL_REVIEW

**Note**: CI/CD integration guide to be added.

## FAQ

**Q: Do I need to do anything different?**
A: No, MAGI integrates automatically into existing workflow.

**Q: Will MAGI slow down reviews?**
A: No, reviewers run in parallel. Often faster than sequential review.

**Q: Can I see individual reviewer reports?**
A: Yes, unified report includes detailed reports from all three reviewers.

**Q: What if MAGI is wrong?**
A: Use `/approve` to override. System learns from overrides.

**Q: Can I customize MAGI for my project?**
A: Yes, via `.omt/magi-config.yml` (planned feature).

**Q: How do I bypass MAGI for hotfix?**
A: Ask @agent-reviewer to skip MAGI, or use `/skip-magi` (planned feature).

**Q: Is MAGI required?**
A: Strongly recommended but can be bypassed for emergencies.

**Q: What about existing `/approve` command?**
A: Still works! Used when MAGI requests MANUAL_REVIEW.

## Summary

**Key Points**:
1. ✅ MAGI provides three-perspective comprehensive review
2. ✅ Integrates seamlessly into existing OMT workflow
3. ✅ No new commands needed for basic usage
4. ✅ Automatic decisions when consensus is clear
5. ✅ Manual review only when perspectives conflict
6. ✅ Educational feedback improves code quality over time

**Benefits**:
- 🎯 More thorough review coverage
- ⚖️ Balanced decision making
- 🚀 Parallel execution (fast)
- 📊 Detailed multi-perspective reports
- 📈 Continuous learning and improvement

## References

- **Architecture**: `/omt/docs/magi-review-system.md`
- **Coordinator**: `/omt/agents/magi.md`
- **Reviewers**:
  - MELCHIOR: `/omt/agents/magi-melchior.md`
  - BALTHASAR: `/omt/agents/magi-balthasar.md`
  - CASPER: `/omt/agents/magi-casper.md`
- **Integration**: `/omt/agents/reviewer.md`

---

**Remember**: MAGI exists to help you ship higher quality code faster. Trust the system, learn from feedback, and enjoy improved code quality!
