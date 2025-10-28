# MAGI Review System

## Overview

The MAGI Review System is inspired by the MAGI supercomputer system from Neon Genesis Evangelion. It provides a comprehensive, multi-perspective code review mechanism using three specialized reviewers that analyze changes from different angles.

## System Architecture

```
Code Implementation (@agent-coder)
            ↓
    MAGI Coordinator (@agent-magi)
            ↓
    ┌───────┴───────┐
    ↓       ↓       ↓
MELCHIOR BALTHASAR CASPER
(Technical)(Product)(Maintenance)
    ↓       ↓       ↓
    └───────┬───────┘
            ↓
    Consensus Analysis
            ↓
    Final Decision
            ↓
    @agent-reviewer (Git Commit)
            ↓
    @agent-pm (Report)
```

## The Three MAGI Reviewers

### 1. MELCHIOR - Technical Reviewer (科學家視角)

**Primary Focus**: Technical Excellence & Performance

**Review Dimensions**:
- **Code Quality**
  - Clean code principles
  - Design patterns usage
  - Code smells detection
  - Complexity analysis

- **Architecture**
  - System design alignment
  - Architectural patterns
  - Module coupling/cohesion
  - Dependency management

- **Performance**
  - Algorithm efficiency
  - Resource utilization
  - Performance bottlenecks
  - Scalability concerns

- **Security**
  - Vulnerability detection
  - Security best practices
  - Input validation
  - Authentication/Authorization

- **Testing**
  - Unit test coverage (>90%)
  - Integration test coverage (>80%)
  - Test quality assessment
  - Edge case coverage

**Quality Gates**: CRITICAL
- Security vulnerabilities
- Performance regressions
- Architectural violations
- Test coverage < threshold

### 2. BALTHASAR - Product Reviewer (母親視角 - 關懷用戶)

**Primary Focus**: User Value & Requirements

**Review Dimensions**:
- **PRD Compliance**
  - Requirements fulfillment
  - Acceptance criteria validation
  - User story completion
  - Feature completeness

- **User Experience**
  - Usability assessment
  - Error handling & messaging
  - User workflow optimization
  - Accessibility compliance

- **Functional Correctness**
  - Business logic validation
  - Edge case handling
  - Data integrity
  - API contract compliance

- **E2E Testing**
  - User journey validation
  - Critical path testing
  - Real-world scenario coverage

**Quality Gates**: CRITICAL
- PRD requirements not met
- User-facing errors
- Accessibility violations
- E2E test failures

### 3. CASPER - Maintenance Reviewer (務實視角)

**Primary Focus**: Long-term Maintainability

**Review Dimensions**:
- **Code Maintainability**
  - Code readability
  - Naming conventions
  - Code organization
  - Technical debt assessment

- **Documentation**
  - API documentation completeness
  - Code comments quality
  - README updates
  - Changelog entries

- **Team Standards**
  - Coding style compliance
  - Convention adherence
  - Commit message quality
  - PR description quality

- **Collaboration**
  - Code review feedback integration
  - Knowledge sharing
  - Onboarding friendliness
  - Debugging ease

**Quality Gates**: MAJOR
- Missing documentation
- Style violations
- Poor code organization
- Inadequate comments

## MAGI Consensus Mechanism

### Voting System

Each MAGI reviewer provides a vote:
- **APPROVE**: No blocking issues found
- **APPROVE_WITH_CONCERNS**: Minor issues, can proceed
- **REQUEST_CHANGES**: Issues must be addressed
- **REJECT**: Critical issues, cannot proceed

### Decision Matrix

| MELCHIOR | BALTHASAR | CASPER | Decision |
|----------|-----------|--------|----------|
| APPROVE  | APPROVE   | APPROVE| ✅ Auto-approve |
| APPROVE  | APPROVE   | APPROVE_WITH_CONCERNS | ✅ Approve (log concerns) |
| APPROVE  | REQUEST_CHANGES | APPROVE | ⚠️ Manual review required |
| REJECT   | *         | *      | ❌ Reject |
| *        | REJECT    | *      | ❌ Reject |
| REQUEST_CHANGES | REQUEST_CHANGES | * | ❌ Request changes |
| Any 2 REQUEST_CHANGES | | | ❌ Request changes |

### Consensus Rules

1. **Unanimous Approval**: All three APPROVE → Auto-commit
2. **Majority Approval**: 2+ APPROVE, 1 APPROVE_WITH_CONCERNS → Approve with warnings
3. **Single Rejection**: Any REJECT → Block commit
4. **Multiple Concerns**: 2+ REQUEST_CHANGES → Request changes
5. **Split Decision**: Mixed votes → Manual review via `/approve`

## Integration with Existing Workflow

### Enhanced Review Flow

```
1. Code Implementation
   @agent-coder completes implementation
   ↓
2. MAGI Review (NEW)
   @agent-magi coordinates three-way review
   - Spawns MELCHIOR, BALTHASAR, CASPER in parallel
   - Collects individual reviews
   - Computes consensus
   ↓
3. Decision Point
   ├─ Auto-approve → @agent-reviewer (commit)
   ├─ Manual review → /approve command
   └─ Reject → @agent-coder (revise)
   ↓
4. Git Commit
   @agent-reviewer executes commit
   ↓
5. Completion
   @agent-pm generates report
```

### Backward Compatibility

- Existing `/approve` command still available for manual override
- Original `@agent-reviewer` now acts as final committer
- MAGI system can be bypassed with `/skip-magi` flag (for emergencies)

## Usage Examples

### Normal Flow (Auto-approval)
```
@agent-coder: "Implementation complete"
@agent-magi: *Initiates three-way review*

MELCHIOR: ✅ APPROVE - Code quality excellent, test coverage 95%
BALTHASAR: ✅ APPROVE - All PRD requirements met, UX validated
CASPER: ✅ APPROVE - Documentation complete, style compliant

MAGI Decision: ✅ UNANIMOUS APPROVAL
@agent-reviewer: *Auto-commits changes*
```

### Manual Review Required
```
@agent-coder: "API changes implemented"
@agent-magi: *Initiates three-way review*

MELCHIOR: ✅ APPROVE - Architecture sound, performance good
BALTHASAR: ⚠️ REQUEST_CHANGES - Breaking API changes detected
CASPER: ✅ APPROVE - Documentation updated

MAGI Decision: ⚠️ MANUAL REVIEW REQUIRED
System: "BALTHASAR flagged breaking changes. Please run /approve"
```

### Rejection Case
```
@agent-coder: "Quick fix implemented"
@agent-magi: *Initiates three-way review*

MELCHIOR: ❌ REJECT - Security vulnerability detected (SQL injection)
BALTHASAR: ✅ APPROVE - Functionality works
CASPER: ⚠️ REQUEST_CHANGES - Missing error handling docs

MAGI Decision: ❌ REJECTED
@agent-magi: "Critical security issue. Handing back to @agent-coder"
```

## Configuration

### Review Thresholds (per MAGI)

```yaml
melchior:
  coverage:
    unit: 90%
    integration: 80%
  complexity:
    cyclomatic: 15
    cognitive: 10
  performance:
    regression_threshold: 10%

balthasar:
  prd_compliance: 100%
  e2e_coverage: critical_paths
  accessibility: WCAG_AA

casper:
  documentation:
    api: required
    code_comments: required
    readme: required_for_features
  style:
    enforce: true
```

## Benefits

1. **Comprehensive Coverage**: Three perspectives ensure nothing is missed
2. **Balanced Decisions**: Technical, product, and maintenance concerns all weighted
3. **Faster Reviews**: Parallel review reduces overall time
4. **Clear Rationale**: Each MAGI provides specific reasoning
5. **Quality Assurance**: Multi-layer validation before commit
6. **Team Alignment**: Standardized review criteria across all changes

## Advanced Features

### Adaptive Learning
Each MAGI learns from past reviews to improve accuracy:
- Tracks false positives/negatives
- Adjusts sensitivity based on project patterns
- Learns team-specific preferences

### Customizable Weights
Projects can adjust MAGI importance:
```yaml
magi_weights:
  melchior: 0.4  # Technical focus
  balthasar: 0.35 # Product focus
  casper: 0.25   # Maintenance focus
```

### Review Reports
Detailed reports available via:
- `/magi-report` - Show last MAGI decision
- `/magi-history` - Show MAGI decision history
- `/magi-stats` - Show approval/rejection statistics

## References

- Original Reviewer Agent: `/omt/agents/reviewer.md`
- Workflow Documentation: `/omt/docs/workflow.md`
- MAGI Agents:
  - MELCHIOR: `/omt/agents/magi-melchior.md`
  - BALTHASAR: `/omt/agents/magi-balthasar.md`
  - CASPER: `/omt/agents/magi-casper.md`
- MAGI Coordinator: `/omt/agents/magi.md`
