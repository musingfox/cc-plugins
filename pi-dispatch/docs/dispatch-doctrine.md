# Dispatch Doctrine — when and how to outsource work to pi

pi-dispatch is a tool, not a methodology: it moves workload from Claude Code
(expensive tokens, native tooling) to external pi workers (cheap, fast,
disposable). Methodologies (cf, spiral, ad-hoc main-thread work) choose when
to use it. This doctrine is the choosing.

## The mental model

Claude Code's native features are in-house employees; pi workers are
contractors. Every native operating mode keeps its organizational shape — the
only question is which seats are filled by a contractor. The worker side is always the same: pi processes managed
by the `pi-agent.sh` primitives (start/send/poll/peek/ls/stop/watch).

### Consumption shapes (one primitive set)

| Native analog    | Control plane                 | Use when |
|------------------|-------------------------------|----------|
| background task  | main + Monitor on `watch`     | single small task; main reads the result anyway |
| dynamic workflow | Workflow script (deterministic) | multi-stage pipelines needing schema gates, journal/resume, concurrency caps |
| (no analog)      | dedicated shell script (cf)   | fixed-domain repeated pipelines; maximum determinism |
| peer session     | `ListAgents` + `SendMessage`  | a Claude session that already exists elsewhere — in practice, another repo |

Row 1 is model-driven (flexible, can drift); rows 2–3 are deterministic
(reliable, written in advance).

Run `pi-agent.sh watch` as a background task (`Bash(run_in_background: true)`) and wait for its completion notification, which wakes main and a sub-agent alike; main can also follow it with Monitor.

Row 4 is discover-and-talk, not dispatch: no verb creates a peer, kills one,
isolates it in a worktree, or picks its model, and `SendMessage` has no CLI, so
no shell caller can reach it. Verified 2026-08-10: a subagent can address a peer
by bare name, but `ListAgents` is unavailable to subagents — they can address,
not discover, so main must name the peer in the brief. Against a plain subagent
it buys nothing except reaching a session that is already sitting in a different
repository; that is the only case worth using it for.

## Dispatch decision — fit first, cost second

Outsource when the contractor is the better fit, not merely cheaper:

- **Capability fit**: the work suits the worker's model or environment —
  bulk web reading, multimedia generation, long-document summarization,
  massive parallel fan-out. `PI_DISPATCH_CMD` is the routing
  unit — one env var holding the agent command and its `--model` flag, so
  the model a worker runs on is its capability profile.
- **Cost fit**: mechanical work with a clear spec, where Claude tokens and
  latency buy nothing.

Keep in-house when any of these fail:

1. **Spec-ability** — the brief can't be made self-contained (the task needs
   implicit conversation context; writing the spec costs more than it saves).
2. **Reviewability** — no one is positioned to judge the result.
3. **Blast radius** — a wrong result contaminates global state before review
   can catch it (irreversible, non-isolated). Prefer dispatching work that is
   worktree-isolated and cheap to redo.

## The contract — two guarantees, one per end

Every dispatch, in every shape, must satisfy both:

**Dispatch end — brief self-sufficiency.** The worker can only open doors you
hand it; anything not in the brief does not exist. A brief carries:
- the task, verbatim where possible (don't let a wrapper reinterpret it)
- acceptance criteria (what "done" observably looks like)
- the operating environment: working directory (absolute paths, never cd
  out), available tools/CLIs, credential assumptions, output path. The
  directory is also where the dispatcher *launches* the worker (`PI_CWD`):
  a brief can tell the worker where to work, but only the launch decides
  where a bare command runs.

**Return end — independent review.** Every dispatch names its reviewer, and
the reviewer is never the worker (self-acceptance) nor the dispatcher (main) —
main has a close-the-task incentive (self-certification). Three seats:

- **the dispatcher** re-runs the deterministic checks (tests, acceptance
  commands, schema) and assembles the evidence bundle;
- **independent reviewer** judges what checks can't decide — non-
  deterministic clauses ("minimal memory", "idiomatic") get evidence-backed
  adversarial judgement at the contract's own precision, in a FRESH session
  given only the contract + deliverable + check results (never the worker's
  transcript);
- **main** owns the final verdict.

Capability rule: **reviewer ≥ worker**. Routings are named by provider and
model, not ranked by tier, so nothing in the tooling enforces this — the
dispatcher picks the reviewer's routing and owns the judgement. A worker
already on the strongest routing available gets a fresh session on that same
routing, or main itself, as reviewer. The reviewer is just another dispatch —
same primitives, a routing at least as capable. The Claude reviewer seat's
frontmatter pins it on `opus` at `xhigh`.

Proportionality: deterministic checks always run; a separate reviewer is
dispatched only when the deliverable is a code change or the contract has
non-deterministic clauses; main may mark a dispatch `no-review` when it will
read and judge the result itself. A dispatch with no reviewer on any seat is
not a dispatch — it's abandonment.
