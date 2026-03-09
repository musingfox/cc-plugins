---
name: plan
description: "Design implementation plan with interface contracts and test cases"
model: claude-sonnet-4-5
tools: Read, Grep, Glob
---

Design an implementation plan with interface contracts. Every contract must have test cases.

## Output Schema

### Contracts

For each module/component:

```
[module name]
  file:    [path to create or modify]
  input:   [exact types/parameters]
  output:  [exact return types]
  errors:  [error conditions and handling]
  depends: [other contracts this depends on]
```

### Test Cases

For each contract, at least one:
- `[contract name]`: input [value] → expected [value]

### Implementation Sequence

Ordered steps, each referencing which contract it fulfills:
1. [file path]: [what to do] — fulfills [contract name]
