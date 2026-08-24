---
id: judge-seats-cannot-edit
status: accepted
scope:
  - "pi-dispatch/agents/reviewer.md"
  - "context-flow/agents/review.md"
verify: check:! grep -h '^tools:' pi-dispatch/agents/reviewer.md context-flow/agents/review.md | grep -qw Edit
related: [dispatch-verdict-from-file]
adr: null
---
A seat that renders a verdict must not hold `Edit`. The tools whitelist in an
agent's frontmatter is the only hard boundary between seats — prose in a system
prompt is soft and drifts, a missing tool does not.

`Write` is permitted: a judge needs to emit its report. `Edit` is not. Write can
overwrite too, but it replaces a whole file — loud in a diff, and not what a
judge reaches for. `Edit` is the surgical one: it turns a FAIL into a PASS by
changing the line that failed, and the deliverable still looks like the
deliverable.

The rule binds the judgement seats specifically. Seats that widen rather than
decide (spiral's divergence) are out of scope — they render no verdict.
