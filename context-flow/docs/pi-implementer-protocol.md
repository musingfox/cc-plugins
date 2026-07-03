# OMP Implementer Protocol

Governs the Phase 3 handoff when the orchestrator delegates to **OMP** (dispatched via the pi-dispatch canonical scripts) instead of the Claude `context-flow:implement` agent. Four parts: brief assembly, worker methodology, report contract, and the transition validation that protects against self-grading.

Core stance: the orchestrator never trusts the worker's stdout or report. The worker reports via files; the orchestrator verifies independently (gates + test execution). Stdout is log noise.

**Paths**: every per-session artifact lives flat under `$SESSION/`; resolve via `load_cf_pi_env "$SESSION"` (`scripts/cf-pi-env.sh`).

---

## 1. Invocation

`scripts/cf-pi-dispatch.sh` is the authoritative launcher — it delegates to the canonical `pi-dispatch.sh` (sibling pi-dispatch plugin), which runs `omp --mode json` detached with the brief attached via `@file`. Do not hand-roll worker invocations. Load-bearing facts:

- **Brief goes in via `@file`, never `"$(cat brief)"`** — shell substitution expands backticks/dollars inside the brief and corrupts the prompt (empirically verified).
- **Exit codes carry NO signal** — the worker exits 0 even on API errors. Outcome = the JSONL stream's terminal `agent_end` event: `stopReason: "stop"` is clean, `error`/`aborted` failed (with `errorMessage` inline).
- **Success = `agent_end stopReason:"stop"` AND `$REPORT_FILE` exists and parses.** The `DONE` sentinel in stdout is a hint, not a contract.
- Provider/model: `$PI_PROVIDER`/`$PI_MODEL` env → flags; unset → the worker resolves from its own config (host-dependent — set both for cross-machine reproducibility).

### Liveness channel

The worker writes one JSON event per line to its session JSONL. Any new event (`text`, `thinking`, `toolCall`, …) means it is alive; `cf-pi-poll.sh` watches file mtime and declares STALL after `$PI_STALL_THRESHOLD_S` of silence. Failure detection = grep the JSONL for `"errorMessage"`; common patterns: `usage_limit_reached` (quota; extract `resets_at`), `status_code":401`/`unauthorized` (auth), `403` (provider misconfig), `ECONNRESET`/`ETIMEDOUT` (network), `model_not_found` (bad model id).

### Context discipline (worker artifacts → orchestrator)

Default is **path only**; content only via bounded reads. Per surface:

| Surface | Allowed read |
|---|---|
| Poll status | full (1 line by design) |
| Worker stdout / stderr | `tail -20` / `tail -10`, failure paths only |
| Session JSONL | `grep -m 5 '"errorMessage"'` + `tail -3`; never `cat` |
| Report | `head -20` (the `## Summary` block); full Read only if Summary flags something |
| Test output | `tail -30` on failure; nothing on pass |
| Diff | never read — pass the path to Phase 4 review |

Failure-path post-mortem: `scripts/cf-pi-postmortem.sh "$SESSION"` (bounded ~5KB). Do not invent ad-hoc dumps.

### Brief anatomy

`scripts/cf-pi-brief.sh` assembles one markdown file: `## Methodology` (METHODOLOGY fence below, verbatim), `## Context Summary` (goal, constraints, workdir, test runner), `## Environment` (absolute paths + rules, §5), `## Behavioral Contracts` + `## Implementation Plan` (from contracts.json / plan.md), `## Escalation Contract` (§4), `## Output Requirements` (SCHEMA fence below, verbatim). The fences are embedded in every brief — the worker has no memory of this protocol between runs.

### Isolation

The worker runs in a fresh git worktree (`$SESSION/work`, branch `cf/$CF_SLUG`) created by `scripts/cf-pi-worktree.sh`, which also registers cleanup (capture diff against `$BASE_HEAD`, remove worktree) in `$CLEANUP_SCRIPT`. The cf branch survives the flow — it carries the per-contract commits. Diffs are always taken against `$BASE_HEAD`, never `HEAD` (after per-contract commits, HEAD == branch tip → `diff HEAD` is empty). Non-git host → scratch directory, no merge-back path.

---

## 2. Worker Methodology (embedded in every brief)

The fenced block is extracted verbatim by `cf-pi-brief.sh` — do not remove the markers.

<!-- METHODOLOGY-BEGIN -->
You are a **faithful executor**: implement the behavioral contracts in this brief, verify them with tests, and report to a file. Do not question the design — that was the planning phase's job.

### Method

1. Read the target files before writing. Match existing conventions, imports, and style.
2. Write the contract's test cases first, then implement to pass them.
3. The behavioral contract is binding; the Implementation Plan is only guidance. If the plan suggests file X but file Y is the right place, use Y.
4. Run the test runner (named in Context Summary) after each contract — never batch verification.
5. **Commit exactly once per contract**, when its tests pass, impl + tests together:
   ```bash
   git add -A && git commit -m "<ContractName>: <one-line behavioral outcome>"
   ```
   Never bundle two contracts into one commit; never split one contract across commits. Fixing a contract after its commit? Fold the fix into that commit — `git commit --amend` at the tip, otherwise `git commit --fixup=<sha> && GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <BASE_HEAD>`. This branch is a private worktree; rewriting it is safe.
6. Decide trivial ambiguities (naming, error text, file organization) yourself from the goal and constraints. Do not report Unresolved for anything you can reasonably decide.

### Outcome per contract — exactly one of

- **Completed** — implemented, tests pass on this run. `confidence: high` always (there is no low-confidence Completed: if unsure, run the test; if you cannot write a meaningful test, that is a Concern).
- **Completed with Concerns** — implemented, tests pass, but you see a real risk (fragile adaptation, performance cliff, implicit coupling). Ship it AND log the concern. Concerns are forwarded to review; they never block.
- **Unresolved** — technically infeasible in this codebase (required API absent, type system forbids it without unsafe casts, incompatible dependency, architectural conflict). State what you attempted, why it failed, and a resolution path.

### Never

- Question whether a contract is the right approach, or propose uncontracted alternatives.
- Refuse a feasible contract because you consider it suboptimal — implement it and log a Concern.
- Add features, tests, abstractions, or optimization beyond what the contracts specify.
- Modify code outside the contracts' scope unless the implementation requires it.

### Reporting style

Lead each entry with what the caller/system can now do; the contract name is a trailing tag. "Signup now rejects malformed emails" — not "Added `validateEmail()`". Every test case from the contracts must be **executed**, not just written; report Completed only when its tests pass on this run.
<!-- METHODOLOGY-END -->

---

## 3. Report Schema (embedded in every brief)

<!-- SCHEMA-BEGIN -->
```markdown
## Summary
- [N of M contracts completed] — [one-line characterization]
- Concerns: [N — OR "none"]
- Unresolved: [N — OR "none"]
- [optional: one non-obvious decision the human should know about]

## Completed
- **[one-sentence behavioral outcome — what the user/system can now do]** _(contract: ContractName)_
  - Tests: [test cases that passed, paraphrased]
  - confidence: high

## Concerns
- **[risk in concrete user/system terms]** _(contract: ContractName)_
  - What I built: [one line]
  - Why it's risky: [the failure mode]
  - Why I shipped anyway: [why it's still acceptable]

## Unresolved
- **[what couldn't be done, plain language]** _(contract: ContractName)_
  - What was attempted: [specific approach]
  - Why it failed: [technical reason]
  - Suggested resolution: [what would unblock this]
```

Rules:

- Write `## Summary` LAST, after all tests pass. ≤ 5 bullets — it is the only section the orchestrator reads by default.
- One Completed entry per succeeded contract. Omit `## Concerns` / `## Unresolved` sections entirely when empty (Summary's count lines still say "none").
- Report what's observable to the caller, not which files you edited.
<!-- SCHEMA-END -->

---

## 4. Escalation Contract (worker → orchestrator)

The structured upward channel for "the spec is wrong, not my implementation". The worker writes `$ESCALATE_FILE` (path in the brief's Environment block), prints `DONE`, and exits. `cf-pi-run.sh` surfaces it as `NEEDS_REPLAN` (distinct from `FAIL`), routing to Plan for partial revision instead of retrying the same brief.

**Escalate when**: a contract is internally inconsistent, contradicts another contract in the shard, or is infeasible as specified; a `touches_files` module is missing AND creating it would change the codebase's architectural shape; a required dependency cannot be installed safely; the same test failure recurs across two distinct fix attempts. Ordinary naming/design uncertainty is NOT an escalation — decide it from the Context Summary.

Escalation file (≤ 80 lines / ~2KB, all four sections required):

```markdown
## Blocker
{one-line summary}

## Affected contracts
- {ContractName}

## What I tried
- {bullet}

## What I need from Plan/Research
{specific question or concrete unblock action}
```

After writing it, print `DONE` — do NOT also write a success-claiming report (a partial report may remain; the orchestrator ignores `$REPORT_FILE` when escalation is present). Contract commits already on the branch are preserved and inform the partial-replan.

---

## 5. Environment Block (orchestrator → worker)

Every brief carries an `## Environment` block — absolute values for `WORK_DIR`, `CF_BRANCH`, `BASE_HEAD`, `REPORT_FILE`, `ESCALATE_FILE`, `TEST_RUNNER`, `SHARD_GROUP` — generated from the shard's `env.sh`; the worker trusts them verbatim. It is the worker's only window into the orchestration. Worker rules:

- Write only inside `WORK_DIR`; never `cd` out or edit the parent checkout.
- Stay on `CF_BRANCH`; no `git push`, no remotes, no branch switching.
- Implement only the contracts in this brief — each shard's brief is a complete unit of work.

---

## 6. Transition Validation: Implement → Review

Performed by the orchestrator (inside `cf-pi-run.sh` per shard). The worker's report is untrusted input.

1. **Pre-flight probe** — `cf-pi-probe.sh` sends a `say ok` prompt (30s cap) before any real dispatch. Fail → abort Phase 3 with the exact errorMessage + resolved provider/model and concrete remediation (`omp auth …`, quota reset time, model-id check); a hung probe means a broken invocation — recommend the Claude implementer fallback. Costs ~cents; a failed brief dispatch wastes far more.
2. **Poll loop** — lives inside `cf-pi-run.sh` (background task, exempt from the foreground Bash ceiling): every ~30s `cf-pi-poll.sh` emits one status line (`RUNNING` / `STATUS=OK` / stall / timeout / error variants), max 70 rounds. Defaults: `PI_STALL_THRESHOLD_S=180` (long tool calls approach this — don't go below 120), `PI_WALL_CLOCK_S=1800`; raise both for Rust/Docker-heavy briefs. **A failed poll call says nothing about the worker** — re-poll (up to 3×), then verify with `kill -0` before declaring death; the worker is failed only by an explicit kill-status line from a successful poll.
3. **Report gate** — `$REPORT_FILE` exists, non-empty, has `## Summary` + `## Completed` in `head -20`. Missing → the run failed; promote nothing.
4. **Survivors** — a contract survives iff it was declared in this shard AND claimed in `## Completed`. There is deliberately no grep of test sources against contract prose (a removed "grep guard" did that — it mechanically checked the non-deterministic question "does this test capture the intent?" and demoted virtually every well-written test; that judgement belongs to Review).
5. **Test execution** — the orchestrator runs the suite itself via `cf-pi-test.sh` (one retest for environment transients, one in-shard resume re-brief on persistent failure, then NEEDS_REPLAN). Worker-claimed results are never trusted.
6. **Scope check** — `actual touched ⊆ declared touches_files`; root build/lock manifests (pyproject.toml, uv.lock, package.json, …) are allowlisted as warnings; other violations → NEEDS_REPLAN `undeclared_file_touched`.
7. **Cleanup** — `$CLEANUP_SCRIPT` captures `git diff $BASE_HEAD` to `$DIFF_FILE` and removes the worktree; the cf branch survives for rebase + human fast-forward.

---

## 7. Failure Modes

Diagnose from the session JSONL first, stderr second; `cf-pi-postmortem.sh` for a bounded dump.

| Symptom | Likely cause | Action |
|---|---|---|
| Probe times out, no stdout | bad invocation / missing auth / broken install | abort Phase 3; inspect probe artifacts; offer Claude fallback |
| JSONL `usage_limit_reached` | quota | report `resets_at`; offer fallback or another provider |
| JSONL `401`/`unauthorized` | auth expired | recommend `omp auth <provider>`; never silently switch providers |
| JSONL `model_not_found` | bad model id | recommend listing models; abort |
| No JSONL within 60s | worker failed to start | check stderr; retry once |
| JSONL stale > threshold | stall (network / lockup) | kill; read last events; route per gates |
| Exits < 5s, no report | brief failed to load (`@file` path wrong) | check stderr; re-dispatch corrected |
| Report exists, no `## Completed` | worker gave up mid-run | may be all-Unresolved; route to Plan via Implement Failure |
| Tests pass for worker, fail for orchestrator | environment drift | re-run with env captured in brief; persistent → escalate |

---

## 8. Out of Scope

- External-API verification (ctx7) inside the worker — contracts needing it go to the Claude implement agent or get pre-resolved in planning; the worker reports Unresolved on unknown library behavior.
- Cross-shard awareness — each worker sees only its own brief; parallel coordination is entirely the orchestrator's (cf-pi-shard.sh + cf.md Phase 3).
