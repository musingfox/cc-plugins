---
id: dispatch-write-targets-declared
status: proposed
scope:
  - "pi-dispatch/scripts/pi-dispatch.sh"
  - "pi-dispatch/extensions/worktree-fence.ts"
  - "pi-dispatch/agents/builder.md"
  - "context-flow/scripts/cf-pi-dispatch.sh"
  - "context-flow/scripts/cf-pi-brief.sh"
  - "context-flow/scripts/cf-pi-env.sh"
verify: check:bash pi-dispatch/tests/writable-test.sh
related: [dispatch-verdict-from-file, quota-ends-the-batch]
source: dispatch-write-set-and-failure-routing
adr: null
---
Every file a brief tells a pi worker to write outside its worktree must be
declared to pi-dispatch in `PI_WRITABLE_FILES`. Never assume the file is
writable because the brief names it. `pi-dispatch.sh` builds both fences from
that one list: the file becomes a single-file entry in `RUNDIR/sandbox.sb` and an
exact-path allow in `worktree-fence.ts`. The list is recorded in `RUNDIR/routing`
and replayed on resume, where the record beats the env. A path that is relative,
has no existing parent directory, or contains `"` exits 2 before `RUNDIR`
exists.

The unit is a file, never a directory. A declared report must not open its
session directory, because sibling shards and other runs live there. Writes
inside `PI_CWD` need no declaration. The one allowed widening is to the file's
parent directory, and only if the write tool is shown to write through a
sibling temp file.

A missing declaration fails without saying why. The sandbox or the fence denies
the write, the worker either writes the file somewhere else or writes nothing,
and the caller reports a malformed or missing report. That reads as a worker
that ignored its brief, and nothing in the result points at the fence.
