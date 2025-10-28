# MAGI Universal Review System

## Overview

The MAGI (Multi-Angle Generative Intelligence) Review System is a comprehensive, multi-perspective analysis framework inspired by the MAGI supercomputer from Neon Genesis Evangelion. It provides thorough evaluation through three specialized perspectives that analyze any subject matter from different angles.

**Core Philosophy**: Complex decisions require multiple viewpoints. MAGI ensures comprehensive analysis by examining every topic through three distinct lenses, combining their insights into a balanced consensus decision.

## Universal Application

MAGI is **not limited to code review**. It can be invoked for:

- 📝 **Planning & Strategy**: Architecture decisions, feature design, technical approach
- 💻 **Code Review**: Implementation quality, test coverage, documentation
- 📋 **Documentation**: PRD review, API specs, user guides
- 🔄 **Process Review**: Workflow changes, team practices, development standards
- 🎯 **Decision Making**: Technology choices, priority decisions, trade-off analysis
- 🐛 **Issue Analysis**: Bug investigation, root cause analysis, impact assessment
- 🚀 **Release Review**: Deployment readiness, rollback plans, risk assessment
- 🔍 **Audit**: Security review, compliance check, quality assessment

**When to invoke MAGI**:
- ✅ Decision scope is broad and impacts multiple areas
- ✅ Trade-offs need careful evaluation from multiple angles
- ✅ Risk level is significant
- ✅ Multiple stakeholders affected
- ✅ Long-term implications need consideration
- ✅ Uncertainty requires comprehensive analysis

## System Architecture

```
Any Context (User/Agent Request)
            ↓
    MAGI Coordinator (@agent-magi)
            ↓
    Analysis Context Determination
            ↓
    ┌───────┴───────┐
    ↓       ↓       ↓
MELCHIOR BALTHASAR CASPER
(Rational) (Empathic) (Pragmatic)
    ↓       ↓       ↓
    └───────┬───────┘
            ↓
    Consensus Analysis
            ↓
    Decision & Recommendations
            ↓
    Appropriate Next Action
```

## The Three MAGI Perspectives

The three MAGI reviewers represent fundamental decision-making perspectives:

### 1. MELCHIOR - Rational Perspective (科學家視角)

**Archetype**: The Scientist - Logical, Analytical, Objective

**Core Focus**: Technical correctness, data-driven analysis, systematic evaluation

**Evaluation Dimensions by Context**:

**Code Review**:
- Technical quality and architecture
- Performance and security
- Testing and validation
- Technical debt

**Planning/Design**:
- Technical feasibility
- Scalability considerations
- Risk assessment
- Resource requirements

**Documentation**:
- Technical accuracy
- Completeness and clarity
- Consistency with implementation
- Edge case coverage

**Decision Making**:
- Data and evidence evaluation
- Technical constraints analysis
- Quantitative impact assessment
- Objective pros/cons

**Perspective Characteristics**:
- ✅ Data-driven and evidence-based
- ✅ Systematic and thorough
- ✅ Focuses on measurable outcomes
- ⚠️ May overlook human factors
- ⚠️ Can be overly perfectionist

### 2. BALTHASAR - Empathic Perspective (母親視角)

**Archetype**: The Mother - User-focused, Caring, Protective

**Core Focus**: User value, stakeholder needs, real-world impact

**Evaluation Dimensions by Context**:

**Code Review**:
- User experience impact
- Feature completeness
- Error handling and usability
- End-user journey validation

**Planning/Design**:
- User needs alignment
- Business value delivery
- Stakeholder satisfaction
- Market fit

**Documentation**:
- User comprehension
- Practical usefulness
- Accessibility
- Real-world applicability

**Decision Making**:
- User/stakeholder impact
- Human factors
- Change management
- Ethical considerations

**Perspective Characteristics**:
- ✅ User and stakeholder focused
- ✅ Considers human impact
- ✅ Values practical benefits
- ⚠️ May be too accommodating
- ⚠️ Can overlook technical constraints

### 3. CASPER - Pragmatic Perspective (務實視角)

**Archetype**: The Pragmatist - Practical, Sustainable, Realistic

**Core Focus**: Long-term sustainability, maintainability, team health

**Evaluation Dimensions by Context**:

**Code Review**:
- Code maintainability
- Documentation quality
- Team standards compliance
- Onboarding friendliness

**Planning/Design**:
- Implementation complexity
- Timeline realism
- Resource availability
- Organizational fit

**Documentation**:
- Maintenance burden
- Update process
- Knowledge transfer
- Team understanding

**Decision Making**:
- Implementation feasibility
- Maintenance cost
- Team capacity
- Organizational readiness

**Perspective Characteristics**:
- ✅ Realistic and grounded
- ✅ Considers long-term sustainability
- ✅ Values team health
- ⚠️ May resist innovation
- ⚠️ Can be overly conservative

## MAGI Consensus Mechanism

### Voting System

Each MAGI perspective provides a vote:
- **APPROVE** (✅): Positive from this perspective, no significant concerns
- **APPROVE_WITH_CONCERNS** (⚠️): Acceptable but has reservations
- **REQUEST_CHANGES** (🔧): Significant issues that should be addressed
- **REJECT** (❌): Critical issues, cannot proceed in current form

### Decision Matrix

| MELCHIOR | BALTHASAR | CASPER | Decision | Interpretation |
|----------|-----------|--------|----------|----------------|
| ✅ | ✅ | ✅ | **UNANIMOUS APPROVAL** | Strong consensus, proceed confidently |
| ✅ | ✅ | ⚠️ | **STRONG APPROVAL** | Good overall, minor concerns noted |
| ✅ | ⚠️ | ⚠️ | **APPROVAL** | Acceptable, monitor concerns |
| ⚠️ | ⚠️ | ⚠️ | **CONDITIONAL** | All have reservations, careful consideration needed |
| ✅ | 🔧 | ✅ | **SPLIT DECISION** | Conflicting views, human judgment required |
| 🔧 | 🔧 | * | **REQUEST CHANGES** | Multiple significant concerns |
| ❌ | * | * | **REJECTION** | Critical issue from any perspective |

### Consensus Interpretation

**UNANIMOUS APPROVAL**: All three perspectives align positively
- High confidence decision
- Minimal risk
- Proceed without hesitation

**STRONG/APPROVAL**: Majority positive with minor concerns
- Generally good decision
- Address concerns incrementally
- Monitor highlighted areas

**CONDITIONAL**: All perspectives have reservations
- Proceed with caution
- Create mitigation plans
- Consider phased approach

**SPLIT DECISION**: Fundamental disagreement between perspectives
- Requires human judgment
- Evaluate trade-offs explicitly
- Make informed choice about priorities

**REQUEST CHANGES**: Multiple perspectives see significant issues
- Need substantial revision
- Address core concerns before proceeding
- May require fundamental rethinking

**REJECTION**: At least one perspective identifies critical problem
- Cannot proceed in current form
- Critical issue must be resolved
- May need complete redesign

## Universal Invocation Patterns

### Pattern 1: Direct Invocation

**When**: You recognize the need for comprehensive review

**How**:
```
@agent-magi please review [subject]

Context:
- What: [what needs review]
- Why: [why MAGI review needed]
- Scope: [what's in scope]
- Background: [relevant context]
```

**Example**:
```
@agent-magi please review our microservices migration plan

Context:
- What: Plan to migrate monolith to microservices
- Why: Decision impacts architecture, team, and timeline
- Scope: Architecture, implementation approach, rollout strategy
- Background: Current monolith has 500K LOC, team of 8 developers
```

### Pattern 2: Agent Handoff

**When**: An agent recognizes complexity exceeds their scope

**How**: Agent hands off to MAGI with context

**Example**:
```
@agent-planner: "This feature impacts multiple systems.
Handing off to @agent-magi for comprehensive analysis."
```

### Pattern 3: Automatic Trigger

**When**: System detects high-impact scope

**Triggers**:
- Large code changes (>1000 lines)
- Multiple system dependencies
- Breaking API changes
- Security-sensitive changes
- Critical path modifications

### Pattern 4: Proactive Consultation

**When**: Before making significant commitments

**How**: Consult MAGI before implementation begins

**Example**:
```
Before we start implementing, @agent-magi please review
our proposed approach for [feature/decision].
```

## Multi-Scenario Application Examples

### Scenario 1: Architecture Decision

**Context**: Choosing between REST and GraphQL for new API

**MAGI Analysis**:

**MELCHIOR** (Rational):
- ✅ APPROVE REST: Simpler, better caching, established patterns
- 🔧 REQUEST_CHANGES GraphQL: Complexity overhead for simple use case
- **Vote**: APPROVE (REST)

**BALTHASAR** (Empathic):
- ✅ APPROVE GraphQL: Better developer experience, flexible queries
- ⚠️ CONCERNS REST: Multiple round trips for complex data
- **Vote**: APPROVE_WITH_CONCERNS (GraphQL preferred, REST acceptable)

**CASPER** (Pragmatic):
- ✅ APPROVE REST: Team already knows it, easier to maintain
- 🔧 REQUEST_CHANGES GraphQL: Learning curve, maintenance complexity
- **Vote**: APPROVE (REST)

**CONSENSUS**: **STRONG APPROVAL for REST**
- 2 votes for REST, 1 vote for GraphQL with concerns
- Recommendation: Use REST, consider GraphQL for future if needs change

### Scenario 2: PRD Review

**Context**: Product Requirements Document for new feature

**MAGI Analysis**:

**MELCHIOR** (Rational):
- ⚠️ CONCERNS: Performance requirements not quantified
- ⚠️ CONCERNS: Error handling scenarios incomplete
- **Vote**: APPROVE_WITH_CONCERNS

**BALTHASAR** (Empathic):
- ✅ APPROVE: User needs well understood
- ✅ APPROVE: User stories clear and valuable
- **Vote**: APPROVE

**CASPER** (Pragmatic):
- 🔧 REQUEST_CHANGES: Timeline unrealistic for scope
- 🔧 REQUEST_CHANGES: No maintenance plan
- **Vote**: REQUEST_CHANGES

**CONSENSUS**: **REQUEST_CHANGES**
- Need to address timeline and maintenance planning
- Add quantified performance requirements
- Document error scenarios

### Scenario 3: Deployment Decision

**Context**: Should we deploy Friday afternoon?

**MAGI Analysis**:

**MELCHIOR** (Rational):
- ✅ APPROVE: All tests pass, no technical blockers
- **Vote**: APPROVE

**BALTHASAR** (Empathic):
- ❌ REJECT: Weekend issue would impact users without support
- **Vote**: REJECT

**CASPER** (Pragmatic):
- ❌ REJECT: Team depleted on Friday, rollback capacity limited
- **Vote**: REJECT

**CONSENSUS**: **REJECT**
- Even though technically ready, human and operational factors critical
- Recommendation: Deploy Monday morning with full team available

### Scenario 4: Bug Priority Assessment

**Context**: Is this bug P0 (drop everything) or P1 (fix soon)?

**MAGI Analysis**:

**MELCHIOR** (Rational):
- 🔧 REQUEST_CHANGES to P1: Not a data corruption issue
- Technical impact is limited to one feature
- **Vote**: P1

**BALTHASAR** (Empathic):
- ❌ P0 JUSTIFIED: Blocks critical user workflow (checkout)
- Affects revenue and user trust
- **Vote**: P0

**CASPER** (Pragmatic):
- ⚠️ CONCERNS: Workaround exists, but not obvious
- Team bandwidth for P0 is limited
- **Vote**: P0 but with resource planning

**CONSENSUS**: **P0 with pragmatic approach**
- User impact justifies P0 priority
- Implement documented workaround immediately
- Fix root cause as high-priority P0 with proper testing

## Integration with OMT Workflow

### Original Flow
```
User → @agent-planner → @agent-coder → @agent-reviewer → @agent-pm
```

### Enhanced Flow with MAGI
```
User → @agent-planner → (MAGI?) → @agent-coder → (MAGI?) → @agent-reviewer → @agent-pm
                          ↓                        ↓
                    Plan review              Code review
```

**MAGI touchpoints**:
1. **After planning** (optional): Review approach before coding
2. **After coding** (recommended): Review implementation before commit
3. **Ad-hoc** (as needed): Any agent or user can invoke

### Backwards Compatibility

- Existing workflows continue to work
- MAGI is opt-in unless triggered automatically
- Can be bypassed in emergencies
- All existing commands remain functional

## Configuration & Customization

### Project-Level Configuration

Create `.omt/magi-config.yml`:

```yaml
# Enable/disable MAGI
enabled: true

# Auto-trigger thresholds
auto_trigger:
  code_changes_lines: 1000
  files_changed: 20
  breaking_changes: true
  security_sensitive: true

# Perspective weights (must sum to 1.0)
weights:
  melchior: 0.33   # Rational
  balthasar: 0.34  # Empathic
  casper: 0.33     # Pragmatic

# Context-specific weights
context_weights:
  code_review:
    melchior: 0.40
    balthasar: 0.30
    casper: 0.30

  planning:
    melchior: 0.30
    balthasar: 0.40
    casper: 0.30

  deployment:
    melchior: 0.25
    balthasar: 0.35
    casper: 0.40

# Decision thresholds
thresholds:
  auto_approve_requires_unanimous: false
  manual_review_on_split: true
  block_on_single_reject: true
```

### Perspective Customization

Adjust MAGI perspectives for project needs:

```yaml
# Example: Security-critical project
melchior:
  extra_focus:
    - security_analysis
    - vulnerability_scanning
    - threat_modeling

# Example: Consumer product
balthasar:
  extra_focus:
    - user_satisfaction
    - accessibility
    - market_feedback
```

## Best Practices

### When to Use MAGI

**✅ Good Use Cases**:
- High-impact architectural decisions
- Complex feature planning
- Critical bug severity assessment
- Major refactoring proposals
- Technology stack changes
- Process/workflow modifications
- Release readiness evaluation
- Incident post-mortem analysis

**❌ Avoid MAGI For**:
- Trivial changes (typos, formatting)
- Emergency hotfixes (time-critical)
- Already well-understood patterns
- Simple bug fixes
- Minor documentation updates

### Maximizing MAGI Value

**1. Provide Rich Context**:
```
@agent-magi review [topic]

Context:
- Background: [why this matters]
- Constraints: [limitations to consider]
- Stakeholders: [who's affected]
- Timeline: [when decision needed]
- Alternatives: [other options considered]
```

**2. Frame the Question Clearly**:
- "Should we proceed with X?" (Yes/No decision)
- "What are the risks of Y?" (Risk assessment)
- "Is Z ready for production?" (Readiness review)
- "How should we approach W?" (Strategy review)

**3. Act on Consensus**:
- **UNANIMOUS APPROVAL**: Proceed confidently
- **APPROVAL WITH CONCERNS**: Proceed but monitor
- **SPLIT DECISION**: Seek additional input, weigh priorities
- **REQUEST CHANGES**: Address feedback, re-review if needed
- **REJECT**: Rethink approach fundamentally

**4. Learn from Patterns**:
- Track which perspective raises concerns most often
- Identify blind spots in planning/execution
- Adjust team practices based on recurring themes

## Advanced Features

### Adaptive Learning

MAGI learns from outcomes:
- Track decisions and their results
- Adjust sensitivity based on false positives/negatives
- Learn project-specific patterns
- Recognize team preferences

### Custom MAGI Perspectives

Add specialized 4th perspective for unique needs:

**Examples**:
- **Security MAGI**: Deep security focus for security-critical systems
- **Cost MAGI**: Financial and resource optimization perspective
- **Compliance MAGI**: Regulatory and legal compliance focus
- **Performance MAGI**: Extreme performance and scalability focus

### Integration Points

**CI/CD Integration**:
- Trigger MAGI on pull requests
- Block merge on REJECT decisions
- Require manual approval on SPLIT decisions

**Monitoring Integration**:
- Correlate MAGI decisions with production metrics
- Learn from production incidents
- Adjust risk assessment based on real outcomes

**Team Tools Integration**:
- Post MAGI reports to Slack/Discord
- Create tickets for REQUEST_CHANGES items
- Update project documentation with decisions

## Troubleshooting

### MAGI Perspectives Conflict Often

**Symptoms**: Frequent SPLIT decisions, slow progress

**Causes**:
- Genuinely complex decisions with real trade-offs
- Perspective weights misaligned with project priorities
- Insufficient context provided

**Solutions**:
- Adjust perspective weights in config
- Provide more detailed context
- Make explicit priority decisions as team
- Consider if decisions are genuinely complex (MAGI working as designed)

### MAGI Too Conservative

**Symptoms**: Too many REQUEST_CHANGES, blocks progress

**Causes**:
- Thresholds too strict
- Perspective weights favor conservative views
- Project in early stage (high churn normal)

**Solutions**:
- Adjust thresholds in config
- Weight MELCHIOR/BALTHASAR higher (less conservative)
- Use `/skip-magi` for rapid iteration phases
- Re-review after multiple changes accumulated

### MAGI Not Catching Issues

**Symptoms**: Problems slip through, production issues

**Causes**:
- Context insufficient for proper analysis
- Perspectives not tuned for project risks
- Auto-approve threshold too lenient

**Solutions**:
- Provide more detailed context
- Add custom perspective for project-specific risks
- Require unanimous approval for high-risk areas
- Review MAGI configuration

## Success Metrics

### Quantitative Metrics

**Decision Quality**:
- % of MAGI-reviewed decisions that succeed
- Production issues in MAGI-approved vs non-reviewed changes
- Time to identify issues (earlier is better)

**Efficiency**:
- Time saved by catching issues early
- Reduced rework from better upfront analysis
- Faster decision-making from structured analysis

**Consensus**:
- % unanimous approvals (higher = better alignment)
- % rejections (track over time, should decrease as quality improves)
- Split decisions requiring manual review

### Qualitative Metrics

**Team Health**:
- Confidence in decisions
- Reduced decision paralysis
- Better shared understanding

**Quality Culture**:
- Proactive quality consideration
- Multi-perspective thinking
- Balanced decision-making

## Summary

**MAGI Philosophy**:
> "Complex decisions require multiple perspectives. No single viewpoint captures the full picture."

**Key Principles**:
1. 🎯 **Three perspectives**: Rational, Empathic, Pragmatic
2. ⚖️ **Consensus-based**: Balanced decision-making
3. 🌍 **Universal**: Applicable beyond code review
4. 🔍 **Comprehensive**: Thorough analysis from all angles
5. 🚀 **Practical**: Actionable recommendations

**When in doubt**: Ask MAGI. Three minds are better than one.

## References

- **Coordinator**: `/omt/agents/magi.md`
- **MAGI Perspectives**:
  - MELCHIOR (Rational): `/omt/agents/magi-melchior.md`
  - BALTHASAR (Empathic): `/omt/agents/magi-balthasar.md`
  - CASPER (Pragmatic): `/omt/agents/magi-casper.md`
- **Workflow Guide**: `/omt/docs/magi-workflow.md`
- **Integration**: `/omt/agents/reviewer.md`

---

*"Trust in the MAGI system. Three perspectives, one truth."*
