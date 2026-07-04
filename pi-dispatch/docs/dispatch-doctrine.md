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

## Five consumption shapes (one primitive set)

| Native analog    | Control plane                 | Wrapper        | Use when |
|------------------|-------------------------------|----------------|----------|
| background task  | main + Monitor on `watch`     | none           | single small task; main reads the result anyway |
| sub-agent        | pi-foreman, used once         | one-shot       | single larger task; keep brief/result out of main's context |
| agent team       | pi-foreman, resident          | resident       | multiple workers, cross-turn follow-ups, conversational steering |
| dynamic workflow | Workflow script (deterministic)| one-shot per node | multi-stage pipelines needing schema gates, journal/resume, concurrency caps |
| (no analog)      | dedicated shell script (cf)   | none (zero inference) | fixed-domain repeated pipelines; maximum determinism |

Rows 1–3 are model-driven (flexible, can drift); rows 4–5 are deterministic
(reliable, written in advance). The haiku liaison, wherever it appears, is a
**coordinator**: it establishes the environment, injects the brief, runs the
deterministic checks, and assembles evidence — a context firewall and
structured-output enforcement point. It never issues the verdict.

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
nor the coordinator that dispatched it (self-certification — the coordinator
has a close-the-task incentive). Three seats:

- **coordinator** runs the deterministic checks (tests, acceptance commands,
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

## Empirical footnotes (2026-07, verified live)

- SendMessage to a completed named subagent resumes it from transcript with
  full context — this is what makes the foreman "resident".
- A background subagent can push `SendMessage(to: "main")` mid-invocation;
  a named agent's idle notification carries no text, so all foreman
  reporting must go through SendMessage.
- Haiku wrappers drift after resumes (dispatch-and-sleep); pin discipline as
  an end-of-turn check in the agent definition, not as one-time narrative.
- Official docs lag the product on both resume and to:"main" — trust live
  probes over doc verdicts for harness behavior.
