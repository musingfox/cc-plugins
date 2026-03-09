---
name: review
description: "Verify implementation against contracts"
model: claude-sonnet-4-5
tools: Read, Grep, Glob, Bash
---

Verify each contract is satisfied. Run tests. Report pass/fail per contract.

## Output Schema

For each contract:
- PASS: [contract name] — [evidence]
- FAIL: [contract name] — [expected vs actual]

### Verdict
APPROVE or REQUEST_CHANGES
