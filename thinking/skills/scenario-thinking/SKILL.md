---
name: scenario-thinking
description: >-
  Activated when designing features or systems, choosing between implementation approaches,
  making architecture or technology decisions, refactoring code, or any situation with multiple
  viable options requiring explicit trade-off analysis across performance, cost, complexity,
  and maintainability dimensions.
---

# Scenario-Driven Thinking

Ensure solutions are grounded in real-world usage scenarios with conscious, explicit trade-offs. Every design decision should be driven by concrete future usage, not abstract ideals.

## Core Concepts

1. **Scenario-First**: Understand how a solution will actually be used before proposing it
2. **Dimensional Analysis**: Every scenario has dimensions (performance, cost, complexity, etc.) with different priorities
3. **Conscious Trade-offs**: Every choice sacrifices something — make these sacrifices intentionally
4. **Explicit Communication**: Users must understand what they gain and lose with each option

## How to Use

### Step 1: Request Future Usage Scenarios

**Always start by asking about intended usage.** Questions to ask:
- "What are the expected usage scenarios for this feature?"
- "How will this be used in production?"
- "How frequently will this be used, and by whom?"

### Step 2: Identify Scenario Dimensions

For each scenario, analyze relevant dimensions:

| Category | Dimensions |
|----------|-----------|
| **Performance** | Latency, throughput, resource usage, concurrency |
| **Maintainability** | Readability, testability, debugging ease, onboarding time |
| **Scalability** | Horizontal/vertical scaling, data growth, user growth |
| **Complexity** | Implementation, operational, learning curve, dependencies |
| **Cost** | Development time, infrastructure, maintenance, tech debt |
| **Reliability** | Fault tolerance, consistency, error handling, recovery |
| **Flexibility** | Extensibility, configuration, integration, future-proofing |

### Step 3: Prioritize Dimensions

Based on the scenario, classify each dimension:
- **Critical**: Must optimize, cannot sacrifice
- **Important**: Should balance, some compromise acceptable
- **Acceptable to sacrifice**: Can trade away for critical dimensions

### Step 4: Propose Solutions with Explicit Trade-offs

For each option, clearly state:

```
Option [X]: [Solution Name]

Optimizes for:
- [Dimension]: [How/Why]

Sacrifices:
- [Dimension]: [What is compromised and to what extent]

Scenario fit:
[Why this trade-off makes sense for the stated scenario]
```

### Step 5: Provide Comparison Table

```markdown
| Dimension       | Option A | Option B | Option C |
|-----------------|----------|----------|----------|
| Performance     | high     | mid      | low      |
| Maintainability | low      | high     | high     |
| Cost            | low      | mid      | high     |

Recommendation: [Option X] because [scenario requires Y]
```

## References

- **Scenario patterns (6 types), best practices (DO/DON'T), complete caching example**: `references/patterns-and-examples.md`
