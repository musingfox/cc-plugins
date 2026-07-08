# Dispatch Doctrine — when and how to outsource work to omp

pi-dispatch is a tool, not a methodology: it moves workload from Claude Code
(expensive tokens, native tooling) to external omp workers (cheap, fast,
disposable). Methodologies (cf, spiral, ad-hoc main-thread work) choose when
to use it. This doctrine is the choosing.

## The mental model

Claude Code's native features are in-house employees; omp workers are
contractors. Every native operating mode keeps its organizational shape — the
only question is which seats are filled by a contractor with a thin haiku
liaison in front. The worker side is always the same: omp processes managed
by the `pi-agent.sh` primitives (start/send/poll/peek/ls/stop/watch).

## Two-node dispatch model (current shape)

The live topology is two nodes off main:

- **builder** — executes the brief. Main either embeds `pi-agent.sh` offload
  usage (builder offloads to an omp worker) or omits it (builder does the work
  itself as a sonnet). The mode is dictated by the brief, not by the builder.
- **reviewer** — independent contract judge. Given only the contract +
  deliverable paths + check output; never sees the builder transcript.

Main dispatches both and owns the final verdict. The worker side (when offloaded)
is always the same: omp processes managed by the `pi-agent.sh` primitives
(start/send/poll/peek/ls/stop/watch). The reviewer is just another dispatch —
same primitives, stronger profile (`reviewer ≥ builder`).

### Consumption shapes (one primitive set)

| Native analog    | Control plane                 | Use when |
|------------------|-------------------------------|----------|
| background task  | main + Monitor on `watch`     | single small task; main reads the result anyway |
| sub-agent        | main → builder (one-shot)     | single larger task; keep brief/result out of main's context |
| agent team       | main → builder (resident)     | multiple workers, cross-turn follow-ups, conversational steering |
| dynamic workflow | Workflow script (deterministic) | multi-stage pipelines needing schema gates, journal/resume, concurrency caps |
| (no analog)      | dedicated shell script (cf)   | fixed-domain repeated pipelines; maximum determinism |

Rows 1–3 are model-driven (flexible, can drift); rows 4–5 are deterministic
(reliable, written in advance). The builder, wherever it offloads, coordinates
the omp worker: it establishes the environment, injects the brief, runs the
deterministic checks, and assembles evidence — a context firewall and
structured-output enforcement point. It never issues the verdict; that seat
belongs to main, informed by the reviewer.

### Historical note (retired topology)

The previous (retired/legacy) control plane used a `pi-foreman` liaison node
between main and the omp worker. That topology is **retired** (legacy, replaced
by the two-node main → builder/reviewer model above). The empirical footnotes
below describe live, current harness behavior of named sub-agents (SendMessage
resume, idle notifications); only the `pi-foreman` liaison topology is retired.

## Dispatch decision — fit first, cost second

Outsource when the contractor is the better fit, not merely cheaper:

- **Capability fit**: the work suits the worker's model or environment —
  bulk web reading, multimedia generation, long-document summarization,
  massive parallel fan-out. `profiles.conf` is the capability routing table;
  today it grades reasoning effort (fast/balanced/careful), and capability-
  axis profiles (search, media, …) slot in without changing any script.
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
  out), available tools/CLIs, credential assumptions, output path.

**Return end — independent review (builder ↔ advisor).** Every dispatch
names its reviewer, and the reviewer is never the builder (self-acceptance)
nor the dispatcher (main) — main has a close-the-task incentive
(self-certification). Three seats:

- **builder** runs the deterministic checks (tests, acceptance commands,
  schema) and assembles the evidence bundle;
- **independent reviewer** judges what checks can't decide — non-
  deterministic clauses ("minimal memory", "idiomatic") get evidence-backed
  adversarial judgement at the contract's own precision, in a FRESH session
  given only the contract + deliverable + check results (never the builder's
  transcript);
- **main** owns the final verdict.

Capability rule: **reviewer ≥ builder** — `profiles.conf` is ordered
(fast < balanced < careful); a builder on the top tier gets a fresh top-tier
session or main itself as reviewer. The reviewer is just another dispatch —
same primitives, stronger profile.

Proportionality: deterministic checks always run; a separate reviewer is
dispatched only when the deliverable is a code change or the contract has
non-deterministic clauses; main may mark a dispatch `no-review` when it will
read and judge the result itself. A dispatch with no reviewer on any seat is
not a dispatch — it's abandonment.

## Empirical footnotes (2026-07, verified live — describe named-agent harness behavior; the pi-foreman topology is retired/legacy)

- SendMessage to a completed named subagent resumes it from transcript with full context — a live, verified harness behavior. This is what makes the resident shape (consumption-shapes row 3) work: main → builder, cross-turn resume.
- A background subagent can push `SendMessage(to: "main")` mid-invocation;
  a named agent's idle notification carries no text, so all foreman-era
  reporting went through that channel. The pi-foreman topology is legacy,
  retired, deprecated (see the Historical note above).
- Haiku wrappers drift after resumes (dispatch-and-sleep); pin discipline as
  an end-of-turn check in the agent definition, not as one-time narrative.
- Official docs lag the product on both resume and to:"main" — trust live
  probes over doc verdicts for harness behavior.
