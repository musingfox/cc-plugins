# Scenario Thinking Patterns and Examples

## Common Scenario Patterns

### Pattern 1: MVP / Early Stage Product
**Prioritize:** Development speed, flexibility, cost
**Sacrifice:** Performance optimization, scalability (can refactor later)
**Reasoning:** Need to validate product-market fit quickly

### Pattern 2: High-Traffic Production System
**Prioritize:** Performance, reliability, scalability
**Sacrifice:** Development speed, code simplicity
**Reasoning:** System maturity justifies investment in optimization

### Pattern 3: Internal Tool
**Prioritize:** Simplicity, maintainability, development speed
**Sacrifice:** Polish, performance optimization, edge case handling
**Reasoning:** Limited users, can fix issues as they arise

### Pattern 4: Library/Framework
**Prioritize:** Flexibility, documentation, backward compatibility
**Sacrifice:** Specific optimizations, opinionated design
**Reasoning:** Must serve diverse use cases

### Pattern 5: Data Pipeline / Batch Processing
**Prioritize:** Throughput, cost efficiency, fault tolerance
**Sacrifice:** Latency (can be slower as long as it completes)
**Reasoning:** Eventual completion more important than speed

### Pattern 6: Prototype / Proof of Concept
**Prioritize:** Speed of implementation, demonstration of core concept
**Sacrifice:** Production quality, error handling, testing
**Reasoning:** Exploratory phase, may be discarded

## Best Practices

### DO:
- Always ask about usage scenarios before proposing solutions
- Make trade-offs explicit and conscious
- Revisit scenarios if requirements change
- Document the reasoning behind trade-off decisions
- Validate assumptions about scenarios with users
- Consider both current and future scenarios (6-12 months)
- Be honest about limitations of proposed solutions

### DON'T:
- Propose solutions before understanding the scenario
- Hide or downplay trade-offs
- Optimize for dimensions that don't matter for the scenario
- Assume one-size-fits-all solutions
- Over-engineer for hypothetical future needs
- Under-engineer for known near-term needs
- Make decisions based on personal preferences rather than scenario needs

## Complete Example: API Caching Decision

### User Request
"I need to add a caching layer to our API."

### Scenario Discovery
**Question:** "What are the expected usage scenarios for this cache?"

**User Response:** "Our API serves product catalog data. We have 10,000 products, each viewed 50-100 times/day, data updated once/day during nightly batch. About 5,000 concurrent users at peak."

### Dimensional Analysis

**Critical:** Read performance, cost efficiency, staleness tolerance (daily updates)
**Important:** Cache hit rate, memory usage, simplicity
**Acceptable to sacrifice:** Write performance, immediate consistency, distributed complexity

### Solution Options

**Option A: In-Memory Cache with Daily Refresh**

Optimizes for:
- Read performance: Sub-millisecond latency from memory
- Cost efficiency: No external cache infrastructure
- Simplicity: Single-process cache

Sacrifices:
- Durability: Lost on restart (acceptable — refreshes daily)
- Distribution: Single instance only
- Fine-grained updates: Cannot update mid-day

**Option B: Redis Distributed Cache**

Optimizes for:
- Scalability: Multiple API servers share cache
- Durability: Persists across restarts
- Fine-grained updates: Invalidate specific products

Sacrifices:
- Complexity: Additional infrastructure
- Cost: Redis hosting overhead
- Latency: 1-2ms network hop vs in-memory

**Option C: CDN Edge Caching**

Optimizes for:
- Global latency: Cache at edge locations
- Scalability: Handles massive traffic spikes

Sacrifices:
- Cost: CDN fees
- Control: Cache invalidation delays
- Complexity: Configuration and debugging

### Comparison

| Dimension        | In-Memory | Redis | CDN   |
|------------------|-----------|-------|-------|
| Read Performance | high      | good  | high  |
| Cost Efficiency  | high      | mid   | low   |
| Simplicity       | high      | mid   | low   |
| Scalability      | low       | high  | high  |

**Recommendation:** Option A — matches daily refresh pattern, minimal complexity, best cost-performance for current traffic. Migrate to Redis if traffic grows 10x or multiple API servers needed.
