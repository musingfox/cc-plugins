---
description: "Context-flow pipeline with Pi implementer (beta) — Phase 3 delegates to pi.dev (uses Pi's own provider/model config by default; override via PI_PROVIDER / PI_MODEL env vars) instead of the Claude implement agent"
argument-hint: "[--fast|--deep] [--research=lite|standard|pro] [--plan=lite|standard|pro] [--review=lite|standard|pro] <goal>"
allowed-tools: [Agent, Read, Write, Bash, Glob, Grep, AskUserQuestion, TeamCreate, TeamDelete, SendMessage]
---

# Context Flow Orchestrator — Pi Implementer Beta

> **Beta**: same pipeline as `/cf`, but Phase 3 (Implement) is delegated to **Pi** (pi.dev). By default Pi uses its own provider/model config (`pi config` / `defaultProvider` / `defaultModel`; CLI fallback `google`). Override per-run via `PI_PROVIDER` / `PI_MODEL` env vars. Research / Plan / Review still run as Claude agents.

You are a **collaborative flow operator**. Your job is to manage a pipeline that mixes Claude agents (Phases 1, 2, 4) with a Pi worker (Phase 3), ensuring each receives exactly the context it needs and delivers outputs sufficient for the next phase. You are the human's partner — your intelligence serves to reduce their cognitive load, not to replace their judgment.

## Setup

All Phase 3 mechanics live in `${CLAUDE_PLUGIN_ROOT}/scripts/cf-pi-*.sh`. The orchestrator drives them; the scripts persist state to `$SESSION/env.sh` so subsequent Bash calls can `source` it.

```bash
SCRIPTS="${CLAUDE_PLUGIN_ROOT}/scripts"
SESSION=$("$SCRIPTS/cf-pi-setup.sh")    # also honors PI_PROVIDER / PI_MODEL / PI_STALL_THRESHOLD_S / PI_WALL_CLOCK_S in env
. "$SESSION/env.sh"                      # exposes SESSION_BASENAME, BRIEF_FILE, REPORT_FILE, PI_PROTOCOL, PI_STDOUT, PI_STDERR, PI_SESSION_DIR, CLEANUP_SCRIPT, PI_DESC, PI_AVAILABLE, NATIVE_AT_AVAILABLE, thresholds
echo "SESSION=$SESSION"
```

Re-source `$SESSION/env.sh` at the top of every subsequent Bash call so paths stay consistent. Sessions are NOT auto-deleted — log the path on completion so the human can inspect.

### Argument Parsing

Parse the user's input to extract mode, per-stage overrides, and goal:

1. **Mode flags**: `--fast` or `--deep`. If neither is present, use `default` mode. If both are present, use the last one. **All subsequent rules read the *resolved* mode.**
2. **Per-stage overrides**: `--research=<tier>`, `--plan=<tier>`, `--implement=<tier>`, `--review=<tier>` where tier is `lite`, `standard`, or `pro`. Invalid tier or stage names are silently ignored. **`--implement=<tier>` is accepted but ignored** — the Pi dispatcher uses Pi's own config (or `$PI_PROVIDER` / `$PI_MODEL` when set), not a Claude tier. Log a one-line notice at Phase 3 start: `implement tier <tier> ignored — Pi dispatcher uses $PI_DESC`.
3. **Goal**: Everything remaining after stripping flags.

Write the goal (flags stripped) to `$SESSION/goal.md`. Log the resolved mode and any overrides.

### Pre-flight check

After `cf-pi-setup.sh`, read `$SESSION/env.sh` and abort early with a human-readable message if any of the following hold:

- `PI_AVAILABLE=0` → print ``/cf-pi` requires the pi CLI on $PATH. Install pi from pi.dev and retry, or run /cf instead.` and exit.
- Resolved mode is `deep` AND `NATIVE_AT_AVAILABLE=0` → standard agent-teams gate (see §Phase 1).

---

## Model Tier System

Three user-facing tiers map to the Agent tool's `model` parameter for Claude phases. **Phase 3 (Implement) does NOT consult this table** — Pi runs on its own provider/model config (or `$PI_PROVIDER` / `$PI_MODEL` when set).

| Tier | `model` value | Use Case |
|------|---------------|----------|
| `lite` | `haiku` | Speed-optimized, simple tasks |
| `standard` | `sonnet` | Balanced cost/quality |
| `pro` | `opus` | Maximum reasoning depth |

### Mode Presets

| Stage | `fast` | `default` | `deep` |
|-------|--------|-----------|--------|
| research | lite | standard | pro |
| plan | standard | pro | pro |
| implement | _Pi — see §Phase 3 (uses `$PI_DESC`)_ |||
| review | lite | standard | standard |

### Tier Resolution

For each Claude stage dispatch, resolve the tier in this order:
1. **Per-stage override** (e.g., `--plan=pro`) → use the override
2. **Mode default** → look up the mode preset table above
3. If no mode flag and no override → use `default` mode

### Complexity-Based Mode Selection

When no mode flag is provided (`default` mode), the orchestrator may **upgrade to `deep` mode** if the goal exhibits high complexity signals (multi-module architectural changes, new system design, cross-cutting concerns affecting 5+ files, significant design decisions). Log the decision.

Do NOT downgrade from the user's explicit mode choice. `--fast` and `--deep` are always respected.

## Agent Registry

| Stage | Agent | Tools | Model |
|-------|-------|-------|-------|
| Research | `context-flow:research` | Read, Grep, Glob, Bash, WebFetch | per tier |
| Plan | `context-flow:plan` | Read, Grep, Glob | per tier |
| **Implement** | **Pi (external; pi.dev)** | Pi's own tools — read/write/edit/bash | **Pi config (override via `$PI_PROVIDER`/`$PI_MODEL`)** |
| Review | `context-flow:review` | Read, Grep, Glob, Bash | per tier |

### Claude Agent Dispatch (Phases 1, 2, 4)

When dispatching a Claude agent:
1. Resolve the tier for this stage → map to `model` value
2. Call `Agent(subagent_type: "context-flow:<stage>", model: "<resolved>", ...)`
3. State which agent and model you selected and why.

### Pi Dispatch (Phase 3) — see §Phase 3 for the full protocol.

### Agent Output Discipline

Identical to `/cf` — see `commands/cf.md` §Agent Output Discipline. Phase 3 (Pi) is exempt: Pi has its own report protocol (§3.7.1, governed by `$PI_PROTOCOL` §3 and §4).

---

## Reporting Principles (orchestrator-side reformat)

[Identical to `/cf` — see `commands/cf.md` for the full table. Summary: lead with consequence, not change; one change per bullet; technical detail lives in evidence sections.]

---

## Human Interaction (use AskUserQuestion by default)

For any decision from the human, prefer `AskUserQuestion` over prose prompts:
1. One- or two-sentence context.
2. `AskUserQuestion` with 2-4 options + "Other" (free-text). Recommended option first, marked `_(my recommendation)_` in its description.
3. On "Other", read free text and continue conversationally.

**Skip AskUserQuestion** for: pure clarification, single-path acknowledgments, or mid-sentence revisions in flight.

---

## Pipeline Overview

```
[research — Agent Teams] → VALIDATE → [plan] → VALIDATE → HUMAN GATE (H/M)
    → [implement — Pi] → VALIDATE (test-file grep guard + test execution)
    → [review — Agent Teams] → PRESENT
```

Every arrow between phases passes through you. The flow is NOT linear — any phase can loop back.

### Agent Teams Default (Research + Review)

[Identical to `/cf` — Research and Review default to Agent Teams; skip to single agent in `fast` mode or for trivial single-file changes. Native mode requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Read `$PROTOCOL_DIR/agent-teams-protocol.md` (where `$PROTOCOL_DIR=$PLUGIN_ROOT/docs` from env.sh).]

### Loop Budget

Track loop counts throughout the session, persisted to `$SESSION/loop-budget.json`:

- **Phase re-runs** (same phase re-run with feedback): max **2 per phase**
- **Cross-phase loops** (return to an earlier phase): max **2 total**
- **Agent Teams re-runs**: max **1 per phase**

Pi phase re-runs (e.g., after a failed test execution check) count as `phase_reruns.implement`. The budget is shared with the Claude implement-agent semantics from `/cf`.

---

## Phase 1: Research (Agent Teams)

[Identical to `/cf` Phase 1. Dispatch teammates (each receives its own `Report path: $SESSION/research-<slug>.md`); perform mid-flight direction checks; synthesize from bounded reads of teammate files into `$SESSION/research.md`; run transition validation Research → Plan.]

---

## Phase 2: Plan

[Identical to `/cf` Phase 2. Dispatch the plan agent with `Report path: $SESSION/plan.md` plus research summary (built from bounded reads of `$SESSION/research.md`) + clarifications; the agent writes `$SESSION/plan.md` itself; run transition validation Plan → Human Gate using bounded reads (e.g., `sed -n '/^## Decisions/,/^## Behavioral Contracts/p' "$SESSION/plan.md"`); execute the Human Gate protocol.]

---

## Phase 3: Implement (Pi)

**This is the only phase that differs from `/cf`.** Pi runs as an external process; the orchestrator brokers brief in, report out. All bash mechanics live in `$SCRIPTS/cf-pi-*.sh`; this section is the decision tree around them.

### 3.1 Pi protocol — bounded reads only

**Do NOT `Read` `$PI_PROTOCOL` into context.** It is 400+ lines and most of it is bytes that flow file→file (methodology + report schema get sed-extracted into the brief by `cf-pi-brief.sh`). Pulling the whole file in costs ~11k tokens you don't need.

Use bounded reads when needed:

| When you need… | Bash snippet |
|---|---|
| Failure-mode recovery options | `sed -n '/^## 5\. Failure Modes/,/^## 6\./p' "$PI_PROTOCOL"` |
| Allowed-read table for an unusual surface | `sed -n '/^### 1\.6/,/^## 2\./p' "$PI_PROTOCOL"` |
| Invocation rules (already inlined as hard rules below) | `sed -n '/^## 1\. Invocation/,/^### 1\.5/p' "$PI_PROTOCOL"` |

### 3.2 Assemble the brief

Author three small inputs first:

- `GOAL_ONELINE` — one-sentence compressed goal (from `$SESSION/goal.md` + research summary).
- `CONSTRAINTS` — bounded read from `$SESSION/research.md` (`sed -n '/^## Constraints/,/^## Key Files/p'`), boiled down to the constraints that affect *implementation* (one short line each).
- `TEST_RUNNER` — extracted from `$SESSION/plan.md` Implementation Plan, or asked via `AskUserQuestion` with the language-appropriate default (e.g., `node --test test/contracts.test.mjs`, `pytest -xvs`, `cargo test`).

Then invoke:

```bash
"$SCRIPTS/cf-pi-brief.sh" "$SESSION" "$GOAL_ONELINE" "$CONSTRAINTS" "$TEST_RUNNER"
```

The script extracts Behavioral Contracts + Implementation Plan from `$SESSION/plan.md`, methodology + report schema from `$PI_PROTOCOL`, stitches `$BRIEF_FILE`, and validates header count. **Non-zero exit + `BRIEF MALFORMED` on stderr** means an upstream heading is missing — inspect `$SESSION/brief-*.md` (each chunk file) to locate which one came out empty, fix the offending heading, re-run.

**Do NOT include**: full research output, decision alternatives, planning rationale, rejected approaches, or this orchestrator's tier/mode metadata.

### 3.3 Set up isolated worktree

```bash
"$SCRIPTS/cf-pi-worktree.sh" "$SESSION"     # echoes WORK path; appends to $CLEANUP_SCRIPT and $SESSION/env.sh
. "$SESSION/env.sh"                           # pick up WORK / REPO_ROOT
```

In a git repo: creates a fresh worktree branch `ctxflow/pi-$SESSION_BASENAME` at `$SESSION/work`. Otherwise: scratch directory at `$SESSION/work` (no cleanup). The cleanup script is registered to run before exiting the flow (success OR escalation) — see §Cleanup.

### 3.4 Pre-flight model probe (mandatory)

```bash
"$SCRIPTS/cf-pi-probe.sh" "$SESSION"          # invoke via Bash tool with timeout: 30000
```

Primary defense against silent stalls — Pi hangs for minutes with zero stdout on auth/quota/model-ID failures. The script emits exactly one status line:

| Status | Meaning | Action |
|---|---|---|
| `OK` | Probe succeeded | Proceed to §3.5 |
| `NO_JSONL` | No stdout AND no JSONL — Pi failed to start | Surface `$SESSION/probe-stderr.log`; recommend fallback to `/cf` or `pi --version` debug |
| `ERROR:<pattern>` | Provider/model error in JSONL | Classify below |

Common `ERROR:<pattern>` excerpts (look up the resolved provider/model via the `model_change` event in `$SESSION/pi-probe/*.jsonl` — essential when Pi resolved from its own config):

- `usage_limit_reached` → extract `resets_at` from headers; surface "quota resets at <timestamp>"; offer fallback to `/cf` or different provider
- `unauthorized` / `status_code:401` → "run `pi auth <resolved-provider>`"
- `model_not_found` → "verify model ID via `pi --list-models <resolved-provider>`" or `pi config` to inspect defaults

If the probe fails, **do NOT dispatch the real brief** — re-running the same broken invocation will reproduce the failure. Escalate via `AskUserQuestion` with options: "Retry probe after fix", "Fall back to Claude implement agent (`/cf` style)", "Switch provider/model", "Abort Phase 3".

### 3.5 Dispatch Pi (background, monitored)

```bash
PI_PID=$("$SCRIPTS/cf-pi-dispatch.sh" "$SESSION")
echo "$PI_PID"
```

The script enforces the §1 hard rules (`$PI_PROTOCOL`): brief via `@file`, `--provider`/`--model` only when env-overridden, mandatory `--session-dir`, no `--no-session`, no `--mode json`, background + `disown`. PID and start timestamp are written to disk so the poll script reads state without depending on orchestrator memory.

State to the human: "Dispatching Pi (`$PI_DESC`) on N contracts. Brief: `$BRIEF_FILE`. Monitoring session JSONL at `$PI_SESSION_DIR`."

### 3.6 Stall detection + error fast-path (re-entrant short poll)

Drive polling from the orchestrator with short ~30s Bash calls — NOT a long-running shell loop. Each call invokes `cf-pi-poll.sh`, which is stateless: reads `pi.pid`, `pi-start.ts`, and the latest JSONL from disk and emits one status line. A failed poll call ≠ Pi failure — just re-poll.

**Orchestrator loop**, via Bash tool with `timeout: 35000`:

```bash
sleep 30 && "$SCRIPTS/cf-pi-poll.sh" "$SESSION"
```

Parse the status prefix and dispatch:

| Status prefix | Interpretation | Next action |
|---|---|---|
| `ALIVE` | Pi running, JSONL fresh | Wait another round. |
| `NO_JSONL` | Pi launched, JSONL not produced yet (within 60s grace) | Wait another round. |
| `NO_JSONL_FAIL` | JSONL missing past 60s grace | Pi failed to start. Kill, post-mortem, escalate. |
| `DONE` | `kill -0` failed — Pi process exited cleanly | Exit loop; proceed to §3.7.1 report check. |
| `STALL` | JSONL mtime unchanged > `$PI_STALL_THRESHOLD_S` | Pi hung. Kill, post-mortem, escalate. |
| `ERROR` | `"errorMessage"` literal in JSONL | Provider failure. Kill, classify (quota/auth/network), escalate. |
| `TIMEOUT` | Wall clock > `$PI_WALL_CLOCK_S` | Kill, post-mortem, escalate. |
| `NO_PID` | `pi.pid` missing | Dispatch broken; abort flow. |

**Monitor-failure tolerance — non-negotiable**: if the poll Bash call itself fails (harness timeout, exit≠0 with no status line, Task crash), re-poll next round. **Pi is only declared failed when a kill-status line is read from a *successful* poll.** Up to 3 consecutive poll failures before escalation; verify with `kill -0 $(cat $SESSION/pi.pid)` from a fresh Bash call before declaring Pi dead.

**Kill helper** (used when a kill-status fires):

```bash
P=$(cat "$SESSION/pi.pid"); kill -TERM "$P" 2>/dev/null; sleep 2; kill -9 "$P" 2>/dev/null
```

**Bounded post-mortem** (kill-status paths only; on DONE the report is the post-mortem):

```bash
"$SCRIPTS/cf-pi-postmortem.sh" "$SESSION"     # ~5 KB output cap, echoes paths for on-demand Read
```

### 3.7 Transition Validation: Implement → Review

#### 3.7.1 Report file exists & parseable

- `$REPORT_FILE` exists and is non-empty.
- Contains both a `## Summary` heading (Pi-authored quick-glance) and a `## Completed` heading. (Concerns/Unresolved sections may be absent — that means none, and Summary's lines say "none".)
- **Bounded read**: `head -20 "$REPORT_FILE"` — reads Pi's `## Summary` block only. Echo `$REPORT_FILE` so the orchestrator can `Read` the full file on demand if Summary flags something. Do NOT `cat` or `head -200` the report.
- If missing/malformed → Pi run failed. Run `cf-pi-postmortem.sh`. **Do NOT** promote any contracts to Completed. Apply §5 of `$PI_PROTOCOL` (Failure Modes & Recovery) to pick a recovery path; default to escalating via `AskUserQuestion`: "Re-dispatch Pi with the same brief", "Fall back to Claude implement agent", "Adjust the plan and re-run", "Other".

#### 3.7.2 Test-file grep guard (anti self-grading)

For every contract claimed in `## Completed`, verify the test file actually contains an assertion that exercises the contract's behavior.

1. Locate the test file (per Implementation Plan or by grepping for the contract name within `$WORK`).
2. Generate the guard as `$SESSION/grep-guard.sh` (script file, not inline `for pat` loop — inline loops parse-fail silently on patterns with apostrophes/parens, e.g. `titleCase('')`). One pattern per `PATTERNS=( … )` entry, `grep -q -F --` against the test file. See §4.3 of `$PI_PROTOCOL`.
3. If a test case's expected value is too generic to grep (e.g., `0`, `""`) → execute the test runner with verbose output and search the test reporter for an assertion line matching that case.
4. If ANY test case has no matching assertion → demote that contract from Completed to Unresolved with reason: `Pi claimed Completed but no matching test assertion was found for test case "{T}".` **Self-grading defense**: Pi consolidates test cases into fewer `test(...)` blocks, so do NOT count `test(` occurrences — grep for literals.

#### 3.7.3 Test execution check

**The orchestrator runs it, not Pi.**

```bash
"$SCRIPTS/cf-pi-test.sh" "$SESSION" <test-command...>
```

Script writes full output to `$SESSION/test-output.log` and emits `test_exit=<n>` + a bounded tail (tail -15 on pass; tail -30 + FAIL/error markers on fail). Never paste the full log.

- All tests pass → Completed claims survive (subject to §3.7.2).
- Any test fails → demote the failing contract(s) to Unresolved using the bounded output as evidence. Re-dispatch Pi at most **once** with failure details appended to the brief — counts as `phase_reruns.implement += 1`.
- Test runner errors out (compile error, missing dependency) → treat as Pi-run failure; escalate with the bounded output.

#### 3.7.4 Consolidate the implement output

After §3.7.1–3.7.3 produce a **merged report** in memory (not a new file unless useful for debugging):

- Pi's `Completed` items that survived both guards
- Pi's `Concerns` (forwarded verbatim — concerns don't gate)
- Pi's `Unresolved` items + any items demoted by §3.7.2/3.7.3, each tagged with the demotion reason

If Concerns exist → forward to the review agent as additional input.

If Unresolved contracts exist:
- Codebase investigation issue (Pi needed knowledge not in the brief)? → loop back to research with enriched goal (cross-phase loop).
- Missing-information issue? → consult human via `AskUserQuestion`: "Adjust contract to {alternative}", "Loop back to research on {area}", "Skip this contract for now", "Fall back to Claude implement agent for this contract", "Other".
- ALL contracts Unresolved → escalate immediately.

#### 3.7.5 Capture the diff for review

```bash
[ -n "$REPO_ROOT" ] && git -C "$WORK" diff HEAD > "$SESSION/implement.diff"
```

Phase 4 review teammates receive this path as `## Diff path` (never inlined). Do not run cleanup yet — Phase 4 may still need `$WORK` if any teammate reads files for context.

### 3.8 Parallel Pi dispatch — DEFERRED (V2)

Beta runs **single Pi instance, sequential** even if the plan exposes independent contract groups. Log: "Beta limitation: implement phase ran sequentially despite N independent contract groups."

### 3.9 Fallback to Claude implementer

If `$PI_AVAILABLE=0` is detected mid-flow, the pre-flight probe fails irrecoverably, or the human selects "Fall back to Claude implement agent" at any recovery prompt, dispatch the Claude `context-flow:implement` agent using `/cf`'s Phase 3 dispatch logic instead. State the fallback explicitly: "Falling back to Claude implement agent (sonnet)." Log this in the final review presentation.

---

## Phase 4: Review (Agent Teams)

[Identical to `/cf` Phase 4. Dispatch review teammates (each receives its own `Report path: $SESSION/review-<lens>.md`) with contracts + test cases + Pi's concerns + the diff **as a path** `$SESSION/implement.diff` — never inline the diff. Synthesize verdict from each teammate's reply (Verdict + PASS/FAIL one-liners); pull evidence via bounded reads only. Handle APPROVE / APPROVE-with-advisories / REQUEST_CHANGES per the standard handling matrix. Write synthesis to `$SESSION/review.md`.]

**Note**: when describing the review to the human, mention which implementer ran ("Implementation by Pi (`$PI_DESC`)" or "Fallback: Claude implement agent (sonnet)"). The human is running a beta and should see which path was used.

---

## Context Compression / Loop Back / Escalation

[Identical to `/cf`. For escalation, read `$PLUGIN_ROOT/docs/escalation-protocol.md` and follow it.]

---

## Cleanup

At the end of the flow (success OR escalation):

```bash
bash "$CLEANUP_SCRIPT"
```

Removes the Pi worktree and branch (if applicable) but preserves `$SESSION/` for inspection. Log the session path for the human.

---

## Beta Caveats (state these to the human at the start of the flow)

- Phase 3 delegates to Pi (pi.dev); defaults and dispatch protocol live in §3.4–3.6 (mechanics in `$SCRIPTS/cf-pi-*.sh`).
- `ctx7`-based external verification is not available inside Pi — flag at plan time or use the Claude fallback (§3.9).
- Parallel implement is deferred (§3.8); multi-group plans run sequentially.

---

## Rules

1. **Context isolation**: never pass information not listed in the phase's context spec.
2. **Contracts are behavioral**: they define input/output/errors, not file paths.
3. **Validate before flow**: check output meets requirements before passing to next phase. For Pi, the test-file grep guard is non-negotiable.
4. **Save everything**: all outputs to `$SESSION/` for traceability — including Pi's stdout/stderr and the brief/report.
5. **Opinionated, not bureaucratic**: when presenting to human, always include your analysis and recommendation.
6. **Treat Pi's report as untrusted**: every Completed claim must survive the grep guard AND independent test execution.
