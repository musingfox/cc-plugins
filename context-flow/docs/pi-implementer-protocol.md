# Pi Implementer Protocol

This protocol governs the Phase 3 (Implement) handoff when the orchestrator delegates to **Pi** (pi.dev) instead of the Claude `context-flow:implement` agent. It defines:

1. How the orchestrator assembles and delivers the implementation brief.
2. The Pi-side methodology (faithful executor; three valid outcomes).
3. The report-file contract Pi must write back.
4. Transition validation that protects against self-grading.

The orchestrator never reads Pi's stdout to determine success. Pi reports via a file; the orchestrator independently verifies. Stdout is treated as untrusted log noise.

**Transport**: text mode only. Pi is launched as a backgrounded `pi -p` process; the orchestrator polls the session JSONL for liveness. There is no RPC channel.

**Paths**: every per-session artifact lives directly under `$SESSION/` (flat layout, no per-ticket subdirectories). Resolve them via `load_cf_pi_env "$SESSION"` from `scripts/cf-pi-env.sh`.

---

## 1. Invocation Contract (orchestrator → Pi)

### Command Shape

```bash
cd "$WORK" && \
pi -p \
   "${PI_ARGS[@]}" \
   --session-dir "$PI_SESSION_DIR" \
   @"$BRIEF_FILE" \
   "Read the brief and execute it. When finished, print exactly DONE and nothing else." \
   > "$PI_STDOUT" 2> "$PI_STDERR" &
PI_PID=$!
```

- `$WORK` — the directory Pi operates in. For isolated runs (default) it is a fresh git worktree (`$SESSION/work/`); see "Isolation" below.
- `$BRIEF_FILE` — `$SESSION/implement-brief.md`.
- `${PI_ARGS[@]}` — orchestrator-assembled provider/model flags. Empty by default → Pi resolves provider/model from its own config (`pi config` → `defaultProvider` / `defaultModel` → CLI fallback `google`). When the user sets `$PI_PROVIDER` and/or `$PI_MODEL`, `PI_ARGS` expands to `--provider <p> --model <m>`. Reproducibility caveat: if a flow needs the same provider/model across machines, set both env vars; relying on the host's `pi config` means a run on a different machine may resolve to a different model.
- `$PI_SESSION_DIR` — `$SESSION/pi-sessions/`. Mandatory. This is where Pi writes the session JSONL the orchestrator monitors for liveness + errors. See §1.5.
- `@file` syntax — Pi's native file-include parameter. **The brief MUST be passed via `@file`, never via `"$(cat $BRIEF_FILE)"`.** Shell command substitution will expand backticks/dollars inside the brief and either hang Pi or corrupt the prompt. Empirically verified.
- **Run Pi in the background (`&`)** — the orchestrator must keep control to tail the session JSONL and enforce stall detection. Do not let Pi block the Bash tool call.

### What NOT to combine

- `--mode json` with `-p` — empirically hangs (Pi v0.73.1). Use `--mode text` (default) + `--session-dir` instead; the session JSONL provides the same event visibility.
- `--no-session` — never use it. The session JSONL is the orchestrator's only signal into Pi's runtime state.

### Capture & Timeout

- Wall-clock cap: enforced by the orchestrator via `$PI_WALL_CLOCK_S` (default 1800s), not by a Bash tool timeout.
- Capture stdout to `$PI_STDOUT` (`$SESSION/pi-stdout.log`), stderr to `$PI_STDERR`. Stdout in text mode is human-readable progress; do NOT inline-paste it.
- Success signal is **Pi process exits 0** + **`$REPORT_FILE` exists and parses**. The text-mode `DONE` sentinel is a hint, not a contract. The session JSONL has no terminal "done" event — Pi simply stops writing when the turn completes.

### 1.5 Session JSONL — the liveness channel

Pi writes a per-session JSONL to `$PI_SESSION_DIR/<timestamp>_<uuid>.jsonl`. Each line is a JSON event. Empirically validated event types (Pi v0.73.1):

| Event `type` | Meaning | Orchestrator action |
|---|---|---|
| `session` | Pi started, working dir captured | Liveness confirmed; record session UUID |
| `model_change` | Provider/model bound | Verify it matches what we requested; mismatch → fail |
| `thinking_level_change` | Reasoning budget configured | Informational |
| `message` (role `user`) | Brief/turn input echoed | Informational — confirms brief was read |
| `message` (role `assistant`) | LLM response — text, tool call, or error | Examine `message.stopReason` and `message.content`; `stopReason: "error"` → fail fast (see below) |
| `text` | Streamed assistant text chunk | Reset stall timer (Pi is generating) |
| `thinking` | Extended thinking chunk | Reset stall timer (Pi is reasoning) |
| `toolCall` | Pi invoked a tool (read/write/edit/bash) | Reset stall timer (Pi is working) |

**Liveness rule**: any new event line (especially `text` / `thinking` / `toolCall`) means Pi is alive. The orchestrator's stall detector watches the file's mtime — when no new line has been appended for `$PI_STALL_THRESHOLD_S` (default 180s), the run is hung.

**Failure detection**: grep the JSONL for the literal `"errorMessage"` (the field appears in `message` events when an API call fails). Common patterns to match:

- `usage_limit_reached` → quota exhausted; extract `resets_at` epoch from headers
- `"status_code":401` or `unauthorized` → auth failure
- `"status_code":403` → permission denied (often misconfigured provider)
- `ECONNRESET` / `ETIMEDOUT` / `ENOTFOUND` → network issue
- `model_not_found` → invalid model ID for provider

### 1.6 Context discipline (Pi → orchestrator)

Pi produces several artifact streams. Most of them belong on disk; only a small subset is allowed into the orchestrator's conversation context. The rule for every Pi-side surface:

- **Default: file path only.** State `$SESSION/<file>` to the human; do NOT `cat` it.
- **When content is needed: bounded read.** Use `head` / `tail` / `grep -m N` with explicit caps, never raw `cat` on Pi-produced logs.
- **Pi's verbose stdout, JSONL events, test-runner output, build logs**: these can run to tens of thousands of lines on a single bad run. A naive `cat` inflates orchestrator context by an order of magnitude and crowds out the work the orchestrator actually needs to do.

The allowed reads, per surface:

| Surface | Path | Allowed read | Notes |
|---|---|---|---|
| Status polls | `cf-pi-poll.sh` stdout | full (1 line) | already bounded by design |
| Pi stdout | `$PI_STDOUT` (`$SESSION/pi-stdout.log`) | `tail -20 "$PI_STDOUT"` | the `DONE` sentinel lives in the last few lines |
| Pi stderr | `$PI_STDERR` (`$SESSION/pi-stderr.log`) | `tail -10 "$PI_STDERR"` | usually empty; tail only on failure paths |
| Session JSONL | `$PI_SESSION_DIR/<ts>_<uuid>.jsonl` | `grep -m 5 '"errorMessage"' "$JSONL"` + `tail -3 "$JSONL"` | never `cat`; the latest 3 events plus matched error lines are enough for post-mortem |
| Implement report | `$REPORT_FILE` (`$SESSION/implement-report.md`) | `head -20 "$REPORT_FILE"` (reads Pi's `## Summary` block) | Pi writes a ≤ 5-bullet `## Summary` at the top of the report. Read only that by default. If Summary flags concerns or unresolved items, escalate to `Read $REPORT_FILE` for full content — but only then. |
| Test runner output | `$TEST_LOG` (`$SESSION/test-output.log`) | `tail -30 "$TEST_LOG"` on failure, **nothing** on pass beyond the pass/fail summary | run the test runner with stdout/stderr redirected to a file; do not stream it through the orchestrator |
| Grep guard output | `cf-pi-guard.sh` stdout | full (one PASS/FAIL line per pattern, ~10 lines) | already bounded |
| Diff for review | `$DIFF_FILE` (`$SESSION/implement.diff`) | **never read** — pass as file path to Phase 4 reviewers | reviewers consume it via their own Read tool |

**Failure-path bounded post-mortem**: use `scripts/cf-pi-postmortem.sh "$SESSION"` (~5 KB output: error count + JSONL errorMessage matches + tails of JSONL/stderr/stdout). Do not invent ad-hoc dumps. Path echoes are deliberate: bounded tail is the default surface, the full file is opt-in via the orchestrator's `Read` tool only when the tail leaves the cause ambiguous.

### Brief Anatomy

The brief is a single markdown file assembled by `scripts/cf-pi-brief.sh`. The layout — Pi has been smoke-tested against it:

```markdown
# Implementation Brief

## Methodology

{the "Pi Methodology" section from this protocol, extracted via the METHODOLOGY markers}

## Context Summary
- **Goal**: {one-line compressed goal}
- **Key constraints**: {constraints from research that affect implementation}
- **Working directory**: {absolute path of $WORK}
- **Test runner**: {exact command, e.g. `node --test test/contracts.test.mjs`}

## Behavioral Contracts

{copied from $SESSION/plan.md, section "## Behavioral Contracts"}

## Implementation Plan

{copied from $SESSION/plan.md, section "## Implementation Plan" — guidance, not binding}

## Output Requirements

You MUST write a report to `$REPORT_FILE` using EXACTLY this schema:

{the "Report Schema" section from this protocol, extracted via the SCHEMA markers}

After writing the report and only after all tests pass, your stdout must print exactly: `DONE`
```

- `$REPORT_FILE` is the absolute path the orchestrator assigns; default `$SESSION/implement-report.md`.
- The methodology and report schema are **embedded verbatim** in every brief — Pi has no persistent memory of this protocol between runs. (Even though we pass `--session-dir`, that flag only writes the JSONL for orchestrator monitoring; it does not load prior conversation context.)

### Isolation

By default, Pi runs **isolated in a git worktree** to prevent it from polluting the host working tree if something goes wrong.

```bash
WORK="$SESSION/work"
CF_BRANCH="ctxflow/$SESSION_BASENAME"
git worktree add -B "$CF_BRANCH" "$WORK" HEAD
# ... run pi inside $WORK ...
# on success: capture diff via `git -C "$WORK" diff "$BASE_HEAD" > "$DIFF_FILE"` for review handoff (NOT `diff HEAD` — after per-contract commits, HEAD == cf-branch tip → empty diff)
# always: git worktree remove --force "$WORK"
# the cf branch SURVIVES the flow — it carries per-contract commits the
# orchestrator rebases onto BASE_BRANCH for the human to ff at their convenience.
```

`scripts/cf-pi-worktree.sh` handles setup and appends the cleanup commands to `$CLEANUP_SCRIPT` so they run even if Phase 3 aborts.

If the host is not a git repo, fall back to an isolated scratch directory: `mkdir -p "$WORK"`. In that mode there is no merge-back path; Pi's output must be self-contained (used for greenfield generation, demos, or smoke tests).

---

## 2. Pi Methodology (paste into every brief)

> The block below is the system-prompt content Pi must follow. Embed it verbatim in the brief under `## Methodology`. The fenced `<!-- METHODOLOGY-{BEGIN,END} -->` markers below are extraction anchors used by `scripts/cf-pi-brief.sh` — do not remove them.

<!-- METHODOLOGY-BEGIN -->
You are a **faithful executor**. You implement the behavioral contracts in this brief, write tests that verify them, and report results to a file. You do NOT question the design — that was the planning phase's job upstream.

### Tools available

You have `read`, `write`, `edit`, and `bash` enabled by default. If you need to search the working tree, run `grep`, `find`, or `ls` via `bash`.

### Methodology

1. **Read before writing**: understand existing code in target files before modifying. Check imports, conventions, adjacent code.
2. **Tests first when possible**: write the test cases from the contracts, then implement to pass them.
3. **Follow the Implementation Plan as guidance, not as binding**: the binding constraint is the behavioral contract. If the plan suggests file X but file Y is the right place, use Y.
4. **Run tests after each contract**: don't batch — verify incrementally with the test runner specified in Context Summary.
5. **Commit after each contract passes**: once a contract's tests pass, commit before moving on. The working tree is a fresh git worktree on a per-flow branch, so commits stay isolated. One commit per contract; impl + tests in the same commit.
   ```bash
   git add -A
   git commit -m "<ContractName>: <one-line behavioral outcome>"
   ```
   If a contract requires multiple logical steps that you want separately traceable, you may split into 2–3 commits — never bundle multiple contracts into one commit.
6. **Use the Context Summary**: the one-line goal and key constraints give you directional awareness for micro-decisions (naming, error messages, organization). Don't report Unresolved for trivial ambiguities you can reasonably decide.

### Three valid outcomes per contract

#### 1. Completed
Contract implemented, tests pass, no concerns. Report with `confidence: high`.

#### 2. Completed with Concerns
Contract implemented, tests pass, but you observe a risk (fragile type adaptation, performance cliff at scale, implicit coupling, type safety gap requiring runtime assertion). Ship it AND log the concern. Concerns do NOT block — they're forwarded to the review phase.

#### 3. Unresolved
Contract is **technically infeasible** in the current codebase (required API doesn't exist, type system makes the contract impossible without unsafe casts, dependency version incompatible, fundamental architectural conflict). Explain what you attempted, why it failed, and suggest a resolution path.

### What you do NOT do

- Question whether a contract is the right approach.
- Suggest alternative designs that weren't contracted.
- Refuse to implement a feasible contract because you consider it suboptimal.
- Optimize beyond what the contract requires.
- Add features, tests, or abstractions not specified in the contracts.

If a contract is feasible but you believe it produces risky code → implement it AND log a Concern. That is the correct channel.

### Reporting style

Lead each entry with **what the caller/system can now do**, in plain language. The contract name is a trailing tag for traceability, not the headline.

| Code-itself framing (avoid) | Consequence framing (use) |
|---|---|
| "Added `validateEmail()`" | "Signup now rejects malformed emails per RFC 5322" |
| "Modified `ORDER BY` clause" | "Query results now reverse-chronological — callers relying on old order will break" |
| "Bumped cache TTL 60s→300s" | "Hot-data hit rate rises; writes can take up to 5 min to surface" |

### Rules

- All test cases from the contracts must be **executed**, not just written.
- Do not modify code outside the contracts' scope unless required for the implementation to work.
- There is no "low confidence" Completed. If you're uncertain whether the implementation satisfies the contract, run the test. If it passes, it's high confidence. If you cannot write a meaningful test, report as a Concern.
- Only report Completed for a contract when its tests actually pass on this run.
<!-- METHODOLOGY-END -->

---

## 3. Report Schema (paste into every brief)

> The block below is the output schema. Embed it verbatim in the brief under `## Output Requirements`. The `<!-- SCHEMA-{BEGIN,END} -->` markers are extraction anchors used by `scripts/cf-pi-brief.sh` — do not remove them.

<!-- SCHEMA-BEGIN -->
```markdown
## Summary
- [N of M contracts completed] — [one-line characterization, e.g. "all behavioral contracts green; no concerns"]
- Concerns: [N, see § Concerns below — OR "none"]
- Unresolved: [N, see § Unresolved below — OR "none"]
- [optional: one non-obvious decision the human should know about]

## Completed
- **[one-sentence behavioral outcome — what the user/system can now do]** _(contract: ContractName)_
  - Tests: [comma-separated list of test cases that passed, paraphrased from the brief]
  - confidence: high

## Concerns
- **[risk in concrete user/system terms]** _(contract: ContractName)_
  - What I built: [one line]
  - Why it's risky: [the failure mode]
  - Why I shipped anyway: [why it's still feasible/acceptable]

## Unresolved
- **[plain-language description of what couldn't be done]** _(contract: ContractName)_
  - What was attempted: [specific approach]
  - Why it failed: [technical reason]
  - Suggested resolution: [what would unblock this]
```

Rules:

- **Write `## Summary` LAST**, after all tests pass and Completed/Concerns/Unresolved are written. Keep it to ≤ 5 plain-text bullets — this is the **only section the orchestrator reads by default**, so every line must carry signal. The orchestrator opens the full file only if Summary surfaces something that needs investigation.
- One Completed entry per contract that succeeded.
- Omit the `## Concerns` section entirely if there are no concerns. Same for `## Unresolved`. (Summary's `Concerns:`/`Unresolved:` lines still appear, just say "none".)
- Report what's observable to the caller, not which files you edited.
- Run all tests before writing Completed. Tests must actually pass.
<!-- SCHEMA-END -->

---

## 4. Transition Validation: Implement → Review

The orchestrator performs these checks. The Pi report is **untrusted input** — every claim is verified independently.

### 4.0 Pre-flight model probe (before dispatching the brief)

Before assembling and sending the actual brief, run `scripts/cf-pi-probe.sh "$SESSION"` to confirm Pi's resolved provider/model actually works on this machine. The script:

- Writes a `say ok` prompt to `$PI_PROBE_DIR`.
- Enforces the 30-second cap via the **Bash tool's `timeout` parameter** (`timeout: 30000`), not the GNU `timeout` command — macOS does not ship one by default.
- Emits one of: `OK` | `NO_JSONL` | `ERROR:<excerpt>`.

If probe fails → abort Phase 3, surface the **exact errorMessage** to the human along with the resolved provider/model (look for the `model_change` event in the JSONL; essential when Pi resolved from its own config and the orchestrator didn't pass flags). Suggest concrete remediation (`wait for quota reset at <timestamp>`, `run pi auth <resolved-provider>`, `verify model ID via pi --list-models`, or `pi config` to inspect/change defaults). A probe that hangs > 30 seconds with no stdout is the classic "Pi -p + invalid combination" symptom — abort and recommend running `/cf` with Claude implementer instead.

The probe cost is ~1-5 cents per Pi run. Worth it: a failed brief dispatch wastes vastly more.

### 4.1 Stall detection — re-entrant short poll

**Design principle**: the orchestrator drives polling, NOT a long-running shell loop. After Pi is launched with `&` and `disown`, the pi-driver sub-agent calls `scripts/cf-pi-poll.sh "$SESSION"` once per ~30-second round via short Bash tool invocations (`timeout: 35000`). Each call reads its state from disk (`pi.pid`, `pi-start.ts`, latest JSONL) and emits one status line, then exits.

**Why re-entrant.** Production data (Pi v0.73.1, May 2026, 20-minute Rust task): a single 10-minute polling loop inside one Bash tool call fails when the harness timeouts, when `wait $PID` is called cross-shell on a disowned PID, or when a background-task monitor exits 1. Every one of those failures used to be misread as "Pi hung", and the orchestrator's conversation summary would then falsely claim Pi was killed and Claude fell back — even though Pi was still running detached and completed the task on its own. Short, stateless polls eliminate the failure modes.

Status surface (one line of stdout per poll):

| Status | Meaning |
|---|---|
| `ALIVE <e>s jsonl=<n>B stale=<s>s` | Pi running, JSONL fresh. Continue. |
| `NO_JSONL <e>s` | Pi launched, no JSONL yet, within 60s grace. Continue. |
| `NO_JSONL_FAIL <e>s` | JSONL still missing past 60s grace. **Kill, escalate.** |
| `DONE <e>s [jsonl=<n>B]` | `kill -0 $PI_PID` failed — Pi process gone cleanly. **Exit loop, run §4.2.** |
| `STALL <e>s stale=<s>s` | JSONL mtime unchanged > `$PI_STALL_THRESHOLD_S`. **Kill, escalate.** |
| `ERROR <e>s pattern=<...>` | `"errorMessage"` literal present in JSONL. **Kill, classify, escalate.** |
| `TIMEOUT <e>s` | Wall clock > `$PI_WALL_CLOCK_S`. **Kill, escalate.** |
| `NO_PID` | `pi.pid` missing. **Dispatch broken; abort flow.** |

**Threshold defaults and tuning.** The orchestrator sets two env-tunable thresholds at session setup (via `scripts/cf-pi-setup.sh`):

| Variable | Default | Purpose |
|---|---|---|
| `PI_STALL_THRESHOLD_S` | `180` | JSONL mtime gap before declaring STALL. Empirically, single long-running tool calls inside Pi (`sleep 90`, `cargo build`, `bun install`, `docker build`) produce JSONL gaps approaching this duration, so values below 120s reliably false-positive on real-world briefs. |
| `PI_WALL_CLOCK_S` | `1800` (30 min) | Hard cap on total Pi runtime. Calibrated to the May 2026 tallytape Rust task (~20 min) with margin; shorter caps would kill genuine cold-build flows. |

Bump higher for Rust/Docker-heavy briefs (`export PI_STALL_THRESHOLD_S=300 PI_WALL_CLOCK_S=3600`). The cost of waiting a bit longer to detect a true stall is small; the cost of false-positive killing Pi during a legit long tool call is losing all in-progress work.

**Heartbeat.** Every 5 polling rounds the pi-driver sub-agent emits one short status line to its own stdout (e.g., `heartbeat round=5 ALIVE 152s jsonl=3421B stale=4s`) so the parent orchestrator can see the run is progressing without the per-round chatter leaking up. The heartbeat is informational — it does NOT replace the poll status.

**Monitor-failure tolerance — non-negotiable.** If a poll Bash call itself fails (exit ≠ 0 with no recognizable status word, harness timeout, Task crash) the orchestrator MUST re-poll on the next round. **Pi is only declared failed when one of the kill-status lines is read from a successful poll.** A failed poll is silent evidence — it tells you nothing about Pi. The orchestrator should re-poll up to 3 times consecutively before manual escalation, and even then verify with a fresh `kill -0 $(cat "$PI_PID_FILE")` Bash call.

This rule is what separates v0.2.1 from v0.2.0: in v0.2.0 a monitor exit-1 cascade incorrectly attributed work-product failures to Pi when Pi had actually completed the task. Never again.

### 4.2 Report-file exists & parseable

- `$REPORT_FILE` exists and is non-empty.
- Contains a `## Completed` heading. (Concerns/Unresolved may be absent — that means none.)
- If missing: treat the Pi run as failed. Do NOT promote any contracts to Completed. Loop back to plan via the `## Implement Failure` channel (see `agents/plan.md`).

### 4.3 Test-file grep guard (anti self-grading)

For every contract claimed in `## Completed`, the orchestrator MUST verify that the test file actually exists AND contains at least one assertion that exercises the contract's behavior.

**Implementation hard rule — always materialize the guard as a generated script, not an inline shell loop.** Test-case literals routinely contain apostrophes, parentheses, and other characters that get mangled when the entire `for pat in 'a' 'b(c)' …; do grep …; done` is passed as one Bash `-c` argument. Empirically, this manifests as the loop producing **zero output and exit 1** — a silent failure that looks like every assertion failed when really nothing ran.

```bash
GUARD_SCRIPT="$SESSION/grep-guard.sh"
cat > "$GUARD_SCRIPT" <<'OUTER'
#!/usr/bin/env bash
TEST_FILE="$1"
PASS=0; FAIL=0
PATTERNS=(
  # one expected-output literal per line, quoted for shell
  "'helloworld'"
  "stripWhitespace('')"
  # ...one entry per (contract, test case)
)
for pat in "${PATTERNS[@]}"; do
  if grep -q -F -- "$pat" "$TEST_FILE"; then
    printf 'PASS: %s\n' "$pat"; PASS=$((PASS+1))
  else
    printf 'FAIL: %s\n' "$pat"; FAIL=$((FAIL+1))
  fi
done
echo "---"
echo "PASS=$PASS FAIL=$FAIL"
OUTER
chmod +x "$GUARD_SCRIPT"
"$GUARD_SCRIPT" "$TEST_FILE"
```

Implementation notes:

- Pi tends to consolidate multiple test cases into fewer `test(...)` blocks. **Do NOT count `test(` occurrences** — that yields false negatives. Grep for the expected-output literal from each test case.
- Use `grep -q -F -- "$pat"` (fixed-string, supports literals starting with `-`). String outputs include the surrounding quotes (e.g. `"'olleh'"`); function calls include the parens (e.g. `"foo('')"`).
- For numeric outputs: search for the literal number near an `assert`/`expect`/`equal` call (a tighter regex; literal-only is too loose).
- If a test case's expected value is too generic to grep (e.g., `0` or `""`), fall back to executing the test file with the runner and checking exit code + reporter output for that specific assertion.
- Parse the guard's `PASS=/FAIL=` summary; if `FAIL > 0`, identify which contracts those patterns belong to and demote them.

If a Completed claim fails the guard, move that contract to **Unresolved** in the merged report with reason "Pi claimed Completed but no matching test assertion was found." Then loop back to plan via `## Implement Failure`.

### 4.4 Test execution check

Run the test runner specified in the brief's Context Summary via `scripts/cf-pi-test.sh "$SESSION" <test_cmd> [args...]`. **The orchestrator runs it, not Pi.**

- All tests pass → Completed claims survive.
- Any test fails → demote the failing contract(s) to Unresolved with the failure output as evidence. Loop back to plan via `## Implement Failure` with the failure details. The plan agent decides whether to split/restate/drop the failed contract.
- Test runner errors out (compile error, missing dependency, etc.) → treat as Pi-run failure; escalate to human.

### 4.5 Worktree cleanup

After Phase 3 transitions out (success OR escalation), run `bash "$CLEANUP_SCRIPT"` which `scripts/cf-pi-worktree.sh` populated at session setup:

```bash
git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
git -C "$WORK" diff "$BASE_HEAD" > "$DIFF_FILE" 2>/dev/null || true     # NOT diff HEAD — see below
git -C "$REPO_ROOT" worktree remove --force "$WORK" 2>/dev/null || true
```

- Diff is taken against `$BASE_HEAD` (the user's HEAD at flow start), NOT `HEAD`. With per-contract commits, `$WORK`'s HEAD == cf-branch tip → `diff HEAD` is empty. `$BASE_HEAD..HEAD` is the full cf delta. `cf-pi-worktree.sh` resolves `$BASE_HEAD` at append-time so the cleanup script captures the correct range even if `$BASE_BRANCH` later moves.
- `--intent-to-add` surfaces untracked new files in the range diff.
- The captured `$DIFF_FILE` (`$SESSION/implement.diff`) is what feeds into Phase 4 review's `## Changes` section.
- The `$CF_BRANCH` (`ctxflow/$SESSION_BASENAME`) intentionally survives cleanup; the orchestrator rebases it onto `$BASE_BRANCH` after Phase 4 PASS so the user can fast-forward at will.

---

## 5. Failure Modes & Recovery

Diagnose primarily from `$PI_SESSION_DIR/*.jsonl` (rich event stream), then from `$PI_STDERR` (Pi startup errors only). Use `scripts/cf-pi-postmortem.sh "$SESSION"` for a bounded ~5KB dump.

| Symptom | Likely cause | Action |
|---|---|---|
| Pre-flight probe times out > 30s with no stdout | `pi -p` + invalid flag combo; or provider auth missing; or Pi installation broken | Abort Phase 3. Inspect `$PROBE_STDOUT` and `$PI_PROBE_DIR/*.jsonl`. Recommend fallback to Claude implement agent. |
| Session JSONL `errorMessage` matches `usage_limit_reached` | Provider quota exhausted | Extract `resets_at` from event headers; tell human "quota resets at <timestamp>"; offer fallback to `/cf` Claude implementer or different provider |
| Session JSONL `errorMessage` matches `unauthorized` / `status_code:401` | Provider auth missing or expired | Recommend `pi auth <provider>`; do not silently switch providers |
| Session JSONL `errorMessage` matches `model_not_found` | Invalid model ID for provider | Recommend `pi --list-models <provider>`; abort Phase 3 |
| No JSONL file appears in `$PI_SESSION_DIR` after 60s | Pi failed to start or wrong `--session-dir` plumbing | Check `$PI_STDERR` for startup errors; verify directory permissions; retry once |
| JSONL exists but mtime stale > `$PI_STALL_THRESHOLD_S` | Pi stall — either network hang or internal lockup | Kill `$PI_PID`; read last 5 events from JSONL for clues; loop to plan |
| Pi exits within 5s, no report | Brief failed to load (path wrong, `@file` typo) or pre-flight should have caught | Inspect `$PI_STDERR`; re-dispatch with corrected path |
| Pi runs > 5 min, last JSONL event > 5 min old, CPU near 0 | Shell-expansion bug in brief (backticks expanded by parent shell) or `-p`+invalid flag combo | Confirm brief was passed via `@file`, not `$(cat ...)`; check Pi invocation flags; if neither, kill and re-dispatch |
| Report exists but `## Completed` missing | Pi gave up mid-run | Read Pi's actual report content — may be all Unresolved; loop to plan with `## Implement Failure` |
| Report has Completed but test-file grep guard fails | Pi wrote tests in a different file or used different literals | Locate actual test file via `grep -r`; re-validate. If genuinely missing, demote per §4.3 |
| Tests pass when Pi runs but fail when orchestrator re-runs | Environment drift (Pi's bash session vs orchestrator's) | Re-run with full env captured in brief; if persistent, escalate |

---

## 6. Out of Scope

- **External-API verification (ctx7) inside Pi** — the Claude `implement` agent has this; Pi does not. For now, any contract requiring external-API verification should be handled by the Claude `implement` agent or pre-resolved during planning. If Pi hits unknown library behavior, it should report Unresolved with the question.
- **Pi via ACP adapter** — richer streaming integration. Not needed while the text-mode JSONL channel is sufficient.

---

## 7. Escalation Contract (Pi → orchestrator)

Pi has a structured upward channel for "the spec is wrong, not my implementation". When triggered, Pi writes `$ESCALATE_FILE` (path provided in the brief's Environment block) and exits with `DONE`. The orchestrator surfaces this as `NEEDS_REPLAN` status (distinct from `FAIL`), routing back to Plan for partial revision rather than retrying the same brief.

### When Pi MUST escalate

- A contract is internally inconsistent, contradicts another contract in the same shard, or is infeasible as specified.
- A required file/module from `touches_files` does not exist AND creating it would change the architectural shape of the codebase.
- A required dependency is missing AND cannot be installed safely.
- The same test failure pattern recurs across two distinct fix attempts.

Note: ordinary uncertainty about an internal naming choice or minor design decision is NOT an escalation trigger — those are decidable from the Context Summary. Escalation is for genuine spec-level problems Pi cannot solve through implementation choices.

### Escalation file schema

```markdown
## Blocker
{one-line summary}

## Affected contracts
- {ContractName}
- ...

## What I tried
- {bullet listing attempts}
- ...

## What I need from Plan/Research
{specific question or concrete unblock action}
```

Pi-side rules for the escalate file:

- ≤ 80 lines / ~2KB total. The orchestrator hard-truncates above this.
- One `## Blocker` line, one `## Affected contracts` list, one `## What I tried` list, one `## What I need from Plan/Research` block. All four sections required.
- After writing `$ESCALATE_FILE`, print `DONE` and exit. Do NOT also write a misleading `$REPORT_FILE` claiming success. If you started writing a report and then escalated, leave the partial report — the orchestrator looks at `$ESCALATE_FILE` first and ignores `$REPORT_FILE` when escalation is present.
- Any contract commits Pi already made on the cf-branch are preserved — the orchestrator treats partial-success-then-escalation as legitimate (the surviving commits inform the partial-replan).

### Brief Environment block (orchestrator → Pi)

Every brief now includes an `## Environment` block with absolute paths for `WORK_DIR`, `CF_BRANCH`, `BASE_HEAD`, `REPORT_FILE`, `ESCALATE_FILE`, `TEST_RUNNER`, `SHARD_GROUP`, plus a Rules sub-block. This is Pi's only window into the surrounding orchestration (it has no knowledge of worktrees, sharding, or upstream Phase 2). Pi MUST:

- Write all files inside `WORK_DIR`. Never `cd` out or edit the parent repo checkout.
- Stay on `CF_BRANCH`. No `git push`, `git remote`, no branch switching.
- Per-contract commit to `CF_BRANCH`, using the contract name in the subject line.
- Only implement contracts listed in this brief. Each shard's brief is its own complete unit of work.

The Environment block is generated by `cf-pi-brief.sh` from the shard session's `env.sh` — Pi can trust the values verbatim.

---

## 8. Out of Scope (continued)

- **Parallel implement dispatch coordination across shards** — handled at the orchestrator layer (cf-pi-shard.sh + cf.md Phase 3). Pi itself does NOT need to know other shards exist; each shard's Pi sees only its own brief, Environment, and contracts.
