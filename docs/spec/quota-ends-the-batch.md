---
id: quota-ends-the-batch
status: proposed
scope:
  - "pi-dispatch/scripts/pi-poll.sh"
  - "pi-dispatch/scripts/pi-agent.sh"
  - "context-flow/scripts/cf-pi-run.sh"
  - "context-flow/commands/cf.md"
verify: check:bash context-flow/tests/quota-batch.test.sh
related: [dispatch-write-targets-declared, dispatch-verdict-from-file]
source: dispatch-write-set-and-failure-routing
adr: null
---
A worker that ends with `QUOTA` or `QUOTA-WINDOW` ends its batch. The consumer
never re-dispatches that work on the same routing, and it stops every sibling
still running in the batch. `pi-poll.sh` applies `quota_class` on every failure
branch. Every tag contains `QUOTA`, so a consumer matching `*QUOTA*` must test
it before any other failure pattern. `pi-agent.sh watch` stops only the names
it was given. `cf-pi-run.sh` records the wall at the parent session, and each
sibling checks that record on every poll round. Every sibling stopped this way
carries the tag of the wall that stopped it.

The batch is the unit, not the session or the machine. A new batch may dispatch
again after the human changes `PI_PROVIDER`/`PI_MODEL`, or after a
`QUOTA-WINDOW` has cleared. A 429 or rate limit is not quota: it stays out of
both patterns and never stops a batch. The rule assumes a batch shares one
routing. If routings are ever mixed within a batch, a sibling is stopped only
when its `RUNDIR/routing` names the same provider.

A violation costs money without anyone noticing. A quota line that falls
through to a generic error branch is retried under the normal retry budget,
and every sibling keeps running into the same wall. Each attempt is a paid
round trip, and the outcome reads as an ordinary failure followed by an
ordinary retry.
