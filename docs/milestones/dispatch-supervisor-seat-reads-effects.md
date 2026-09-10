---
status: superseded  # accepted | done | superseded
delivered:          # commit or tag ref — filled when acceptance passes
depends: []         # milestone slugs that must land first
---

# A supervisor seat for dispatched workers that reads effects, not intent

**Superseded on 2026-09-11, the day it was accepted, by a fix at the dispatch layer.** Tracing
the three incidents showed one root cause: pi takes `process.cwd()` and the dispatcher never
moved it, so every worker started in the human's checkout and a bare `git commit` landed there
(67 of 67 September cf workers with a recorded cwd started in the real repo). The fix is to
launch the worker inside its worktree (`PI_CWD`, `pi-dispatch/scripts/pi-dispatch.sh`) and to
fence the worker from inside its own process: a `git` shim first on its PATH refuses mutating
verbs against any repo outside the worktree (`pi-dispatch/shims/git`), a `tool_call`
extension refuses `write`/`edit` outside it (`pi-dispatch/extensions/worktree-fence.ts`), and
on macOS a `sandbox-exec` profile denies every other write outside it. That
is the first overturn condition below, met before anything was built. The fence is not the
"pre-emptive containment" this run rejected: that needed interrupt authority over a live worker
from outside, on the dispatch path; the fence refuses the worker's own command before it runs,
in-process, with no channel and no seat. The measurement and the rejections of the other
directions stand; the build-facing sections were dropped so nobody starts `/cf` on a seat that
is not being built.

The dispatch framework card asked for a resident, out-of-band observer over offloaded workers,
with three fixed constraints: never on the dispatch's critical path (the retired `pi-foreman` was
an in-path liaison, `pi-dispatch/docs/dispatch-doctrine.md:59-65`), never on the smallest model
tier, and paid for only if a failure baseline justifies it. This run settled what such a seat
watches, and on what evidence.

## Why the boundary is where it is

**The incident class it targets is measured.** A scan of 261 cached runs (228 context-flow, 33
pi-dispatch) found that on the current pi carrier since 2026-09-01 (84 runs), two workers ran
git mutations on the human's real repository instead of their worktree, and a third announced it
had run in the wrong repo and switched before mutating:
`~/.cache/pi-runs/context-flow/run-20260908-191612-25077` (`git -C …/cc-plugins reset --hard`,
self-narrated "The commit landed in the wrong repo"), `run-20260910-132214-52009`
(`git -C …/tw-politic-war reset --mixed HEAD~1`), `run-20260910-152353-62626` (narration only).
All self-corrected; none was caught. Roughly one per 25 to 40 dispatches. The existing scope
audit reads the worktree's own log and is blind to this by construction
(`context-flow/scripts/cf-pi-scope.sh:49`). Every out-of-worktree effect was a bash git command;
no write/edit tool call landed outside its worktree in any run.

**The signal is carrier-independent, and that is why the first answer fell.** The first
convergence chose brief conformance on the claim that each tool call carries a natural-language
`intent` field. That field belonged to the omp carrier, retired 2026-09-02; no run since has it.
Worker final text has a median under ten characters per run; the narration lives in thinking
blocks at transcript scale. A signal coupled to the carrier has already failed once; git state
does not move when the carrier does.

**Pre-emptive containment and machine-wide watching were rejected on grounds the correction did
not touch.** Containment before the write lands needs interrupt authority over a live worker,
the in-path position that was retired. Machine-wide state has a different lifetime and a
different consumer and is not a per-dispatch supervisor.

## What would overturn this

- **The incident class stopping** because the dispatch layer removes out-of-worktree mutation
  (recording the worktree and refusing `git -C` elsewhere, or a harness sandbox). The seat then
  watches for something that no longer happens.
- **The predicate drowning in noise**: legitimate workers routinely touching forbidden repos for
  reasons the set cannot exclude.
- **A cheap, carrier-stable narration signal reappearing.** It could be added; it would not
  replace this, since every measured incident is a git effect.

Directions that lost:
- *No seat, post-hoc only* — one incident per 25 to 40 dispatches in a class the audit cannot
  see.
- *Read the worker's narration* — near-empty final text, transcript-scale thinking, carrier-
  coupled, already failed once.
- *Pre-emptive containment* — needs the retired in-path position.
- *Machine-wide fleet watching* — different lifetime and consumer.

