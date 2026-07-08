# Main Orchestration Loop — pi-dispatch

This document is the canonical description of how Claude Code's **main** thread
orchestrates work through pi-dispatch. Main is the orchestrator and the verdict
owner; it never executes the brief itself. The loop has six steps. Two agents
do the hands-on work — **builder** (executes the brief, either by offloading
to an omp worker or by doing it itself) and **reviewer** (independent contract
judge). Main dispatches both and owns the final verdict.

## 1. Offload decision

Main decides, per task, whether to **offload** the execution to an external omp
worker (cheap, fast, disposable) or to **self-do** it on a Claude sonnet
builder. The decision belongs to main, not to the builder.

Offload when the task is a good fit for a worker:

- self-contained brief (no implicit conversation context needed),
- reviewable result (someone can judge correctness from the deliverable),
- isolated blast radius (worktree-isolated, cheap to redo),
- mechanical or bulk work where Claude tokens buy nothing.

Self-do (sonnet builder, no offload) when any of those fail — the brief can't
be made self-contained, the result isn't independently reviewable, or a wrong
result contaminates global state before review can catch it. Main picks the
mode and encodes it in the brief; the builder does not choose.

## 2. Brief writing

Main writes one self-contained brief per task. The brief carries:

- the task, verbatim where possible,
- acceptance criteria (what "done" observably looks like),
- the operating environment: working directory (absolute paths, never cd out),
  available tools/CLIs, credential assumptions, output path,
- for code-writing tasks, an isolation worktree path.

**Offload path**: main loads the `pi-agent.sh` operator usage from
`skills/pi-dispatch/SKILL.md` and embeds it verbatim into the brief. The
builder will run `pi-agent.sh start` / `watch` / `poll` / `peek` / `ls` / `stop`
/ `send` as a pure operator.

**Self-do path**: the brief carries no offload usage. The builder carries out
the task itself with its own tools and runs the acceptance check.

The presence or absence of the embedded `pi-agent.sh` usage is the single
signal that selects the builder's mode.

## 3. Builder dispatch

Main dispatches one **builder** agent per task, driven by the brief from
step 2. The builder executes:

- usage present → offload mode: operate `pi-agent.sh` as a pure operator,
  relay `PERMISSION` lines back to main, run each worker's acceptance check
  when it settles, distill a report,
- usage absent → self-do mode: do the work directly, write tests, run the
  acceptance check, distill a report.

The builder never issues the verdict and never judges the contract. It hands
the contract + deliverable paths + check output back. Main relays one
distilled report per task (NAME, what happened, result path, check output tail).

## 4. Reviewer dispatch

Main dispatches one **reviewer** agent per task. The reviewer's brief is the
**contract surface only**:

- the contract verbatim (the frozen Examples / acceptance clauses),
- the deliverable paths (files the reviewer may open and read),
- the check output (the acceptance command's captured output).

The builder transcript is **forbidden** — the reviewer never sees it, never
asks for it. The reviewer's independence is the whole contract: it judges from
the contract and the deliverable, not from how the deliverable was produced.
It returns one PASS/FAIL per clause with file:line evidence, plus a one-line
final verdict (PASS only if every clause is PASS).

Main passes the reviewer only the contract + deliverable + check output —
never the builder's transcript, never the builder's working notes.

## 5. Verdict ownership

Main owns the final **verdict**. It reads the reviewer's per-clause PASS/FAIL
and the builder's distilled report, then decides: accept, reject, or rework.
Main is the only seat that can accept a deliverable. A dispatch with no
reviewer on any seat is not a dispatch — it is abandonment; main either
dispatches a reviewer or reads and judges the result itself (`no-review`).

## 6. Pi-fail fallback

When the builder reports an **offload failure**, main re-dispatches the SAME
task as a **self-do sonnet** builder (brief with no offload usage). The
fallback triggers are any of:

- `STATUS=FAIL` returned by the worker (the builder's report carries the
  STATUS=FAIL line with cause),
- **omp token** exhausted (auth quota hit; the worker can't run),
- **worker crash** (the omp process died before producing a result),
- any other **offload fail** the builder reports.

On any of those, main stops retrying the offload path and re-dispatches the
same task scope as a self-do sonnet builder (no `pi-agent.sh` usage in the
re-dispatch brief). The fallback is one-shot: if self-do sonnet also fails, main
judges the task failed and hands the gap back to the caller rather than looping.
The re-dispatch brief is identical to the original task brief minus the
embedded offload usage.