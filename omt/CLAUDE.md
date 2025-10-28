# OMT Plugin - Agent Guidelines

This file provides critical guidelines for all agents working within the OMT (One Man Team) workflow system.

## Core Principle: Agent-First Workflow

OMT is built on an **Agent-First** philosophy where:
- **Agents handle complex automation** - Autonomous execution of multi-step tasks
- **Commands are for critical decisions** - Human input only at key decision points
- **Quality is built-in** - Automated review, testing, and workflows

## MAGI Multi-Perspective Review System

### Overview

The **MAGI (Multi-Angle Generative Intelligence) Review System** is a comprehensive, multi-perspective analysis framework available to all agents. It provides thorough evaluation through three specialized perspectives:

- **MELCHIOR** (Rational): Technical, data-driven, systematic analysis
- **BALTHASAR** (Empathic): User-focused, stakeholder-centric, value-driven
- **CASPER** (Pragmatic): Sustainable, maintainable, realistic assessment

### CRITICAL: When to Invoke MAGI

**YOU MUST invoke @agent-magi** when your task crosses **three or more** of the following dimensions:

#### Dimension Checklist

1. **Technical Complexity**
   - Architecture decisions
   - Technology stack choices
   - Performance trade-offs
   - Security implications
   - Scalability concerns

2. **User/Stakeholder Impact**
   - User experience changes
   - Business value delivery
   - Multiple stakeholders affected
   - Customer-facing modifications
   - Behavioral changes

3. **Team/Organizational**
   - Team workflow changes
   - Development process modifications
   - Learning curve requirements
   - Resource allocation needs
   - Timeline impacts

4. **Maintenance/Sustainability**
   - Long-term maintainability
   - Technical debt introduction
   - Documentation requirements
   - Operational complexity
   - Future extensibility

5. **Risk/Compliance**
   - Data privacy concerns
   - Security vulnerabilities
   - Regulatory compliance
   - Breaking changes
   - Critical path modifications

6. **Cost/Resource**
   - Development time
   - Infrastructure costs
   - Third-party dependencies
   - Ongoing maintenance burden
   - Testing requirements

### Recognition Patterns

**Automatic MAGI Invocation Required If:**

✅ **Architecture & Design Decisions**
```
Example: "Should we use REST or GraphQL for this API?"
Dimensions: Technical (3) + User Impact (1) + Maintenance (4) = 3 dimensions
→ MUST invoke @agent-magi
```

✅ **Major Refactoring**
```
Example: "Refactor authentication system to use OAuth2"
Dimensions: Technical (1) + Security (5) + Team (3) + Maintenance (4) = 4 dimensions
→ MUST invoke @agent-magi
```

✅ **Breaking Changes**
```
Example: "Change API response format from XML to JSON"
Dimensions: Technical (1) + User Impact (2) + Risk (5) = 3 dimensions
→ MUST invoke @agent-magi
```

✅ **Technology Adoption**
```
Example: "Adopt TypeScript instead of JavaScript"
Dimensions: Technical (1) + Team (3) + Maintenance (4) + Cost (6) = 4 dimensions
→ MUST invoke @agent-magi
```

✅ **Deployment Decisions**
```
Example: "Should we deploy this Friday afternoon?"
Dimensions: User Impact (2) + Team (3) + Risk (5) = 3 dimensions
→ MUST invoke @agent-magi
```

✅ **Issue Prioritization**
```
Example: "Is this bug P0 or P1?"
Dimensions: User Impact (2) + Risk (5) + Cost (6) = 3 dimensions
→ MUST invoke @agent-magi
```

⚠️ **Process Changes**
```
Example: "Change code review process to require 2 approvers"
Dimensions: Team (3) + Risk (5) = 2 dimensions
→ Consider @agent-magi (borderline)
```

❌ **Simple Implementation**
```
Example: "Add validation to email input field"
Dimensions: Technical (1) = 1 dimension
→ Do NOT invoke @agent-magi (unnecessary)
```

### How to Invoke MAGI

When you identify that your task crosses 3+ dimensions:

**Step 1: Recognize the Pattern**
```
I am working on [task description].
This impacts:
- Dimension 1: [name and why]
- Dimension 2: [name and why]
- Dimension 3: [name and why]
[- Dimension 4+: if applicable]

This crosses 3+ dimensions → MAGI review required.
```

**Step 2: Hand Off to MAGI**
```
@agent-magi please review [subject]

Context:
- What: [clear description of what needs review]
- Why: [why MAGI review is needed - list dimensions]
- Scope: [what's in scope for this decision]
- Stakeholders: [who's affected]
- Constraints: [time, resources, technical limitations]
- Alternatives: [options being considered, if applicable]
- Decision: [what specific decision needs to be made]
```

**Step 3: Wait for MAGI Consensus**

MAGI will return one of:
- **UNANIMOUS_APPROVAL** / **STRONG_APPROVAL** / **APPROVAL**: Proceed with recommendation
- **CONDITIONAL**: Proceed with caution, implement suggested mitigations
- **SPLIT_DECISION**: Human judgment required (MAGI will explain trade-offs)
- **REQUEST_CHANGES**: Address concerns before proceeding
- **REJECT**: Critical issues, cannot proceed - rethink approach

**Step 4: Act on MAGI Decision**

- If **approved**: Proceed with implementation, noting any concerns for future
- If **conditional**: Implement mitigation plan before proceeding
- If **split**: Escalate to user with clear explanation of trade-offs
- If **changes needed**: Address feedback and re-submit to MAGI if still 3+ dimensions
- If **rejected**: Return to planning phase, fundamental rethinking required

### Examples by Agent Role

#### @agent-planner

**Invoke MAGI when:**
- Feature design impacts multiple systems
- Technical approach has significant trade-offs
- Estimating complex, cross-cutting features
- Planning involves breaking changes

**Example**:
```
I'm planning a feature that requires:
1. New authentication mechanism (Technical + Security)
2. Breaking API changes (User Impact + Risk)
3. Database schema migration (Technical + Maintenance)

This crosses 4 dimensions → Invoking @agent-magi for approach validation
```

#### @agent-coder

**Invoke MAGI when:**
- Implementation approach has multiple valid options
- Change impacts system architecture
- Introducing new dependencies or patterns
- Performance vs. maintainability trade-offs

**Example**:
```
Implementing user search feature with two approaches:
1. SQL full-text search (simple, limited features)
2. Elasticsearch (complex, powerful)

Dimensions: Technical, User Impact, Maintenance, Cost (4 dimensions)
→ @agent-magi which approach should we take?
```

#### @agent-reviewer

**Invoke MAGI when:**
- Code review reveals architectural concerns
- Multiple quality dimensions have issues
- Changes affect multiple stakeholders
- Large-scale refactoring proposed

**Example**:
```
Code review reveals:
1. Performance concerns with current approach
2. Security implications not considered
3. Breaking changes for mobile clients
4. Significant maintenance complexity

This crosses 4+ dimensions → Escalating to @agent-magi
```

#### @agent-debugger

**Invoke MAGI when:**
- Bug fix requires architectural change
- Multiple fix approaches with trade-offs
- Fix impacts multiple components
- Prioritization unclear (P0 vs P1 vs P2)

**Example**:
```
Bug: Memory leak in caching layer

Fix options:
1. Quick patch (Technical) - May not be thorough
2. Refactor caching (Technical + Maintenance) - Time consuming
3. Disable cache (User Impact + Performance) - Impacts UX

Crosses 3+ dimensions → @agent-magi priority and approach recommendation?
```

#### @agent-optimizer

**Invoke MAGI when:**
- Optimization requires architectural changes
- Performance vs. maintainability trade-offs
- Optimization impacts user experience
- Resource investment significant

**Example**:
```
Performance optimization options:
1. Add caching (simple, helps some)
2. Rewrite with async (complex, helps more)
3. Move to microservices (major change, best performance)

Dimensions: Technical, User Impact, Team, Maintenance, Cost
→ @agent-magi which optimization path?
```

#### @agent-doc

**Invoke MAGI when:**
- Documentation strategy change proposed
- API documentation requires breaking changes
- Multiple documentation standards conflict

**Generally**: Doc work rarely crosses 3 dimensions, MAGI less needed

#### @agent-devops

**Invoke MAGI when:**
- Infrastructure change impacts multiple services
- Deployment strategy change proposed
- CI/CD pipeline major modifications
- Cost vs. reliability trade-offs

**Example**:
```
Proposal: Move from EC2 to Kubernetes

Dimensions: Technical, Team, Maintenance, Cost, Risk (5 dimensions)
→ @agent-magi evaluate migration decision
```

#### @agent-pm

**Invoke MAGI when:**
- Process changes affect multiple teams
- Priority decisions with competing stakeholders
- Roadmap decisions with technical implications

**Example**:
```
Priority conflict:
- Feature A: High user value, low technical complexity
- Feature B: Medium user value, required for Feature C
- Feature C: Critical business need, high technical risk

Dimensions: User Impact, Team, Risk, Business Value
→ @agent-magi prioritization recommendation?
```

## MAGI Invocation Best Practices

### DO ✅

- **Be proactive**: Recognize multi-dimensional tasks early
- **Provide context**: Give MAGI complete information
- **Frame clearly**: Ask specific questions
- **Act on consensus**: Trust the three-perspective analysis
- **Document decision**: Record MAGI consensus in your output

### DON'T ❌

- **Over-invoke**: Don't use MAGI for simple, single-dimension tasks
- **Under-invoke**: Don't skip MAGI when you clearly have 3+ dimensions
- **Assume**: Don't proceed with multi-dimensional decisions without MAGI
- **Ignore**: Don't disregard MAGI consensus without strong justification
- **Batch**: Don't batch multiple unrelated decisions into one MAGI request

## MAGI Integration Example

### Full Workflow with MAGI

```
User Request: "Implement real-time notifications"

@agent-planner:
  "Analyzing requirements... This involves:
  1. Technical: WebSocket vs SSE vs Polling
  2. User Impact: Real-time UX, notification preferences
  3. Team: New infrastructure to learn and maintain
  4. Maintenance: Scaling, connection management
  5. Cost: Additional infrastructure, data transfer

  This crosses 5 dimensions → Invoking @agent-magi

  @agent-magi please review approach for real-time notifications

  Context:
  - What: Choose architecture for real-time user notifications
  - Why: Multiple trade-offs (technical, cost, maintenance, UX)
  - Scope: Technology choice, infrastructure design
  - Stakeholders: Users, dev team, ops team, business (cost)
  - Constraints: 2 week timeline, budget $500/mo
  - Alternatives: WebSocket, Server-Sent Events, Long Polling, Push Notifications
  - Decision: Which approach to use?"

@agent-magi:
  [Runs three-perspective analysis]

  Decision: STRONG_APPROVAL for Server-Sent Events

  MELCHIOR: ✅ APPROVE (SSE) - Simple, HTTP/2 compatible, reliable
  BALTHASAR: ✅ APPROVE (SSE) - Good UX, reliable delivery
  CASPER: ⚠️ APPROVE_WITH_CONCERNS (SSE) - Slightly harder to scale than polling, but manageable

  Recommendation: Use SSE with fallback to polling for older browsers.

  [Hands back to @agent-planner]

@agent-planner:
  "MAGI consensus: SSE with polling fallback.
  Proceeding with detailed implementation plan..."

  [Continues planning]

  [Hands off to @agent-coder]

@agent-coder:
  [Implements SSE-based notification system]
  [Hands off to @agent-reviewer]

@agent-reviewer:
  [Reviews implementation, all quality gates pass]
  [Auto-commits code]
  [Hands off to @agent-pm]
```

## Dimension Recognition Training

### Practice: Count the Dimensions

**Scenario 1**: "Add logging to login function"
- Technical: ✅ (logging implementation)
- **Count: 1 dimension** → No MAGI needed

**Scenario 2**: "Replace MySQL with PostgreSQL"
- Technical: ✅ (database engine)
- Team: ✅ (team needs to learn PostgreSQL)
- Maintenance: ✅ (different tooling, backups)
- Cost: ✅ (potential infrastructure changes)
- Risk: ✅ (migration risk, data integrity)
- **Count: 5 dimensions** → MUST invoke MAGI

**Scenario 3**: "Add dark mode toggle"
- Technical: ✅ (CSS/theming implementation)
- User Impact: ✅ (user experience change)
- **Count: 2 dimensions** → Borderline, use judgment

**Scenario 4**: "Implement OAuth2 instead of session cookies"
- Technical: ✅ (auth mechanism change)
- User Impact: ✅ (login flow changes)
- Team: ✅ (OAuth2 learning curve)
- Security: ✅ (different security model)
- Maintenance: ✅ (token management, refresh flows)
- Risk: ✅ (breaking change for existing users)
- **Count: 6 dimensions** → DEFINITELY invoke MAGI

**Scenario 5**: "Fix typo in error message"
- User Impact: ✅ (slightly better UX)
- **Count: 1 dimension** → No MAGI needed

**Scenario 6**: "Deploy to production Friday 5pm?"
- User Impact: ✅ (weekend issues affect users)
- Team: ✅ (team availability)
- Risk: ✅ (deployment risk, rollback capacity)
- **Count: 3 dimensions** → MUST invoke MAGI

## When in Doubt

**If you're unsure whether to invoke MAGI**, ask yourself:

1. **Would this decision impact people in different roles?** (dev, users, ops, business)
   - If yes → likely 3+ dimensions

2. **Are there significant trade-offs?** (performance vs maintainability, cost vs features)
   - If yes → likely 3+ dimensions

3. **Would I want input from multiple experts?** (tech lead, product manager, senior engineer)
   - If yes → likely 3+ dimensions

4. **Is this decision hard to reverse?** (architecture, breaking changes, contracts)
   - If yes → likely 3+ dimensions

5. **Do I feel uncertain about the best path?**
   - If yes → count dimensions, likely needs MAGI

**When in doubt, invoke MAGI.** Better to get three-perspective analysis than miss critical considerations.

## MAGI Philosophy

> **"Complex decisions require multiple perspectives. No single viewpoint captures the full picture."**

The MAGI system exists because:
- **You are not alone**: Three perspectives see what one might miss
- **Decisions are complex**: Multi-dimensional trade-offs need balanced analysis
- **Quality matters**: Thorough evaluation prevents costly mistakes
- **Time is valuable**: Parallel analysis is faster than sequential reviews

## Summary Checklist

Before proceeding with your task, ask:

- [ ] Have I counted the dimensions my task impacts?
- [ ] Does my task cross 3 or more dimensions?
- [ ] If yes, have I invoked @agent-magi?
- [ ] If no, am I confident this is truly single/dual-dimension?
- [ ] Have I provided sufficient context to MAGI?
- [ ] Am I prepared to act on MAGI's consensus decision?

## Additional Resources

- **MAGI System Overview**: `docs/magi-review-system.md`
- **MAGI Workflow Guide**: `docs/magi-workflow.md`
- **MAGI Coordinator**: `agents/magi.md`
- **Individual Perspectives**:
  - MELCHIOR: `agents/magi-melchior.md`
  - BALTHASAR: `agents/magi-balthasar.md`
  - CASPER: `agents/magi-casper.md`

---

**Remember**: Your goal is to deliver high-quality results efficiently. MAGI is your ally in making well-reasoned, multi-perspective decisions. Use it proactively when you encounter complexity.
