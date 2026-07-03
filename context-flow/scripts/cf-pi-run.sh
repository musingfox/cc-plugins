#!/usr/bin/env bash
# Full Phase-3 lifecycle for ONE shard, end-to-end, in pure shell.
# Main launches this as a background task (run_in_background) and only reads the
# resulting OUTCOME_FILE -- it never sees brief/report/JSONL/test logs directly
# (the background task's stdout is captured to its own output file, not main's
# context). Runs to completion synchronously here, so it is exempt from the
# foreground Bash ceiling.
#
# Usage:   cf-pi-run.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER
# Stdout:  operator-facing progress lines (one per major event)
# Writes:  $BRIEF_FILE, $REPORT_FILE (OMP), $ESCALATE_FILE (OMP optional),
#          $DIFF_FILE, $OUTCOME_FILE (this script -- structured outcome)
# Exit:    0 = PASS, 1 = FAIL, 2 = NEEDS_REPLAN
#
# Lifecycle (in order):
#   1. cf-pi-worktree.sh     create worktree + branch (BEFORE brief, so brief's
#                            Environment block can include WORK/CF_BRANCH/BASE_HEAD)
#   2. cf-pi-brief.sh        assemble brief
#   3. cf-pi-probe.sh        liveness probe
#   4. cf-pi-dispatch.sh     background OMP
#   5. poll loop             cf-pi-poll.sh once per ~30s, max 70 rounds
#   6. escalation detect     $ESCALATE_FILE present => NEEDS_REPLAN
#   7. gate 1 report         head -20 contains ## Summary && ## Completed
#   8. survivors set         contracts this shard both declared and reported done
#   9. gate 3 test execute   cf-pi-test.sh; one in-shard re-dispatch on fail
#  10. actual ⊆ declared     git diff name-only ⊆ shard's declared files
#  11. capture diff          git diff $BASE_HEAD > $DIFF_FILE
#  12. write OUTCOME_FILE    structured paths-only result main reads back

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 4 ]; then
  echo "Usage: cf-pi-run.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER" >&2
  exit 1
fi

SHARD_SESSION="$1"
GOAL="$2"
CONSTRAINTS="$3"
TEST_RUNNER="$4"

load_cf_pi_env "$SHARD_SESSION"
if [ -z "${FLOW_SESSION:-}" ] || [ -z "${SHARD_ID:-}" ]; then
  echo "cf-pi-run: $SHARD_SESSION/env.sh missing FLOW_SESSION or SHARD_ID -- not a sharded session" >&2
  exit 1
fi
load_cf_flow_env "$FLOW_SESSION"

START_TS=$(date +%s)

# -------- helpers --------------------------------------------------------

# Format elapsed seconds since START_TS.
elapsed_s() {
  local now; now=$(date +%s)
  echo "$((now - START_TS))s"
}

# Progress line: task stdout AND $SHARD_SESSION/progress (single line,
# overwritten each call — read by cf-pi-status.sh for phase visibility).
say() {
  echo "[shard $SHARD_ID] $*"
  printf '%s %s\n' "$(date +%H:%M:%S)" "$*" > "$SHARD_SESSION/progress" 2>/dev/null || true
}

# One-line human-readable failure cause for outcome.md, picked from the
# artifact that matches the failure reason (a plausible-but-wrong cause is
# worse than none). Empty on PASS / no evidence.
derive_cause() {
  local status="$1" reason="$2" cause=""
  [ "$status" = "PASS" ] && return 0
  case "$reason" in
    escalate)
      cause=$(sed -n '/^## Blocker/{n;p;q;}' "$ESCALATE_FILE" 2>/dev/null) ;;
    test-fail*|"test runner error")
      [ -s "$TEST_LOG" ] && \
        cause=$(grep -E 'FAILED|failed|Error|not ok|✗' "$TEST_LOG" 2>/dev/null | head -1) ;;
    undeclared_file_touched)
      cause="scope violation — see undeclared_files below" ;;
    *)
      # infra failures (stall/timeout/rc-fail/error/...): worker-side error stream
      local _rd=""; [ -f "$SHARD_SESSION/pi-rundir" ] && _rd="$(cat "$SHARD_SESSION/pi-rundir" 2>/dev/null || true)"
      local _j; _j=$(ls -t "${_rd:+$_rd/sessions}"/*.jsonl "$PI_SESSION_DIR"/*.jsonl 2>/dev/null | head -1 || true)
      [ -n "$_j" ] && cause=$(grep -m1 -o '"errorMessage":"[^"]*"' "$_j" 2>/dev/null) ;;
  esac
  printf '%s' "$cause" | head -c 300
}

# Write OUTCOME_FILE. Args:
#   $1 status (PASS|FAIL|NEEDS_REPLAN)
#   $2 reason (enum string)
#   $3 survived contracts (newline-sep, may be empty)
#   $4 affected contracts (newline-sep "Name: reason", may be empty)
#   $5 postmortem path (or "-")
#   $6 undeclared files (comma-sep, or "-")
write_outcome() {
  local status="$1" reason="$2" survived="$3" affected="$4" pm="$5" undecl="$6"
  local jsonl_path="-"
  local _canon_rundir=""; [ -f "$SHARD_SESSION/pi-rundir" ] && _canon_rundir="$(cat "$SHARD_SESSION/pi-rundir" 2>/dev/null || true)"
  local _jsonl_dir="${_canon_rundir:+$_canon_rundir/sessions}"
  [ -z "$_jsonl_dir" ] && _jsonl_dir="$PI_SESSION_DIR"
  local newest; newest=$(ls -t "$_jsonl_dir"/*.jsonl 2>/dev/null | head -1 || true)
  [ -n "$newest" ] && jsonl_path="$newest"

  local esc_path="-"
  [ -s "$ESCALATE_FILE" ] && esc_path="$ESCALATE_FILE"

  local report_path="-"
  [ -s "$REPORT_FILE" ] && report_path="$REPORT_FILE"

  local diff_path="-"
  [ -s "$DIFF_FILE" ] && diff_path="$DIFF_FILE"

  local test_log_path="-"
  [ -s "$TEST_LOG" ] && test_log_path="$TEST_LOG"

  local cause; cause=$(derive_cause "$status" "$reason")

  {
    printf '## Status\n%s\n\n' "$status"
    printf '## Reason\n%s\n\n' "$reason"
    printf '## Cause\n%s\n\n' "${cause:--}"
    printf '## Run\n'
    printf -- '- shard: %s\n' "$SHARD_ID"
    printf -- '- elapsed: %s\n' "$(elapsed_s)"
    printf -- '- report: %s\n' "$report_path"
    printf -- '- diff: %s\n' "$diff_path"
    printf -- '- session_jsonl: %s\n' "$jsonl_path"
    printf -- '- escalate: %s\n\n' "$esc_path"

    printf '## Survived contracts\n'
    if [ -z "$survived" ]; then
      printf -- '- (none)\n'
    else
      printf '%s\n' "$survived" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        printf -- '- %s\n' "$line"
      done
    fi
    printf '\n'

    printf '## Affected contracts\n'
    if [ -z "$affected" ]; then
      printf -- '- (none)\n'
    else
      printf '%s\n' "$affected" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        printf -- '- %s\n' "$line"
      done
    fi
    printf '\n'

    printf '## Artifacts\n'
    printf -- '- postmortem: %s\n' "$pm"
    printf -- '- test_log: %s\n' "$test_log_path"
    printf -- '- undeclared_files: %s\n' "$undecl"
  } > "$OUTCOME_FILE"

  # --- persistent run index (survives the /tmp session purge) -------------
  # The cf working session lives under /tmp (it carries a git worktree) and is
  # purged on reboot, taking its postmortem/stderr/outcome with it. Mirror a
  # durable record into $PI_RUNS_DIR so a failed shard stays diagnosable: one
  # index line per outcome (shared with pi-dispatch/spiral via the `label`
  # column), plus, on any non-PASS, a copy of the outcome + postmortem bundle.
  # All best-effort (|| true): observability must never fail the run.
  local runs_dir="${PI_RUNS_DIR:-$HOME/.cache/pi-runs}"
  mkdir -p "$runs_dir" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date +%Y-%m-%dT%H:%M:%S%z)" "context-flow" "$status" "$reason" \
    "$(elapsed_s)" "$SHARD_SESSION" \
    >> "$runs_dir/index.log" 2>/dev/null || true
  if [ "$status" != "PASS" ]; then
    local bundle="$runs_dir/context-flow/$(basename "$SHARD_SESSION")__${SHARD_ID}"
    mkdir -p "$bundle" 2>/dev/null || true
    cp "$OUTCOME_FILE" "$bundle/outcome.md" 2>/dev/null || true
    [ -f "$SHARD_SESSION/postmortem.log" ] && \
      cp "$SHARD_SESSION/postmortem.log" "$bundle/postmortem.log" 2>/dev/null || true
  fi
}

# Names of contracts declared in this shard (newline-sep).
shard_contract_names() {
  jq -r --arg sid "$SHARD_ID" '.groups[$sid].contracts[]' "$SHARDS_FILE"
}

# Extract Completed-claimed contract names from $REPORT_FILE.
# OMP protocol uses "_(contract: Name)_" suffix on each Completed bullet.
completed_contracts() {
  # Pull only the lines inside ## Completed section.
  sed -n '/^## Completed/,/^## /p' "$REPORT_FILE" \
    | grep -oE '_\(contract: [^)]+\)_' \
    | sed -E 's/^_\(contract: (.+)\)_$/\1/' \
    | awk '!seen[$0]++'
}

# Run cf-pi-postmortem.sh and stash output as a file path. Returns the path.
do_postmortem() {
  local out="$SHARD_SESSION/postmortem.log"
  "$SCRIPTS/cf-pi-postmortem.sh" "$SHARD_SESSION" > "$out" 2>&1 || true
  echo "$out"
}

# -------- 1. worktree (MUST run before brief so BASE_HEAD/CF_BRANCH/WORK
#               appear correctly in the brief's Environment block) -----

say "setting up worktree"
"$SCRIPTS/cf-pi-worktree.sh" "$SHARD_SESSION" >/dev/null

# Worktree appended REPO_ROOT/BASE_BRANCH/BASE_HEAD to env.sh; re-source.
load_cf_pi_env "$SHARD_SESSION"
load_cf_flow_env "$FLOW_SESSION"

# -------- 2. brief ------------------------------------------------------

say "assembling brief"
if ! "$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "$GOAL" "$CONSTRAINTS" "$TEST_RUNNER" >/dev/null; then
  write_outcome FAIL brief-assembly "" "" "-" "-"
  say "FAIL brief-assembly"
  exit 1
fi

# -------- 3. probe ------------------------------------------------------

say "probing pi"
PROBE_STATUS=$("$SCRIPTS/cf-pi-probe.sh" "$SHARD_SESSION")
case "$PROBE_STATUS" in
  OK*)
    say "probe ok"
    ;;
  NO_JSONL*)
    write_outcome FAIL probe-error "" "(all): probe NO_JSONL" "-" "-"
    say "FAIL probe NO_JSONL"
    exit 1
    ;;
  ERROR:*)
    write_outcome FAIL probe-error "" "(all): probe $PROBE_STATUS" "-" "-"
    say "FAIL probe $PROBE_STATUS"
    exit 1
    ;;
  *)
    write_outcome FAIL probe-error "" "(all): probe unknown ($PROBE_STATUS)" "-" "-"
    say "FAIL probe unknown: $PROBE_STATUS"
    exit 1
    ;;
esac

# -------- 4-5. dispatch + poll (factored so step 9 can re-dispatch) -----

# dispatch_and_poll [RESUME_PROMPT_FILE]
# With an argument, cf-pi-dispatch.sh resumes the prior OMP session and sends the
# file as the new prompt (context-retaining re-brief); without, fresh dispatch.
dispatch_and_poll() {
  local resume_file="${1:-}"
  say "dispatching pi${resume_file:+ (resume re-brief)}"
  local pi_pid
  pi_pid=$("$SCRIPTS/cf-pi-dispatch.sh" "$SHARD_SESSION" ${resume_file:+"$resume_file"})
  say "pi pid=$pi_pid"

  local rundir
  rundir="$(cat "$SHARD_SESSION/pi-rundir" 2>/dev/null || true)"

  # Terminal FAIL while pi may still be alive: cancel the orphan tree, capture a
  # postmortem, record the outcome with its reason, and exit.
  fail_kill() {  # reason  diagnostic
    "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
    local pm; pm=$(do_postmortem)
    write_outcome FAIL "$1" "" "(all): $2" "$pm" "-"
    say "FAIL $1"
    exit 1
  }

  local round=0
  local max_rounds=70
  while [ "$round" -lt "$max_rounds" ]; do
    round=$((round + 1))
    sleep 30
    local status_line
    status_line=$("$SCRIPTS/cf-pi-poll.sh" "$SHARD_SESSION" 2>&1)
    say "round $round/$max_rounds $status_line"

    # Match the canonical pi-poll.sh STATUS= grammar directly (legacy tokens retired).
    case "$status_line" in
      STATUS=OK*)              return 0 ;;
      RUNNING*)                continue ;;   # includes "RUNNING settling"
      *exit\ rc=*)             fail_kill rc-fail "poll $status_line" ;;
      *TIMEOUT*)               fail_kill timeout "poll $status_line" ;;
      *STALL*)                 fail_kill stall "poll $status_line" ;;
      *empty*terminal=stop*)
        # Agent cleanly ended its turn (stopReason=stop) but produced no report/diff
        # (e.g. thinking-only). NOT a stall — detectable at once, fail fast.
        fail_kill no-output "agent ended turn without output ($status_line)" ;;
      *ERROR*|*not-stop*)      fail_kill error "poll $status_line" ;;
      *died-mid-stream*)
        # rc==0 but no agent_end: events present -> died mid-stream (error);
        # no events at all -> no actionable jsonl.
        if [ -n "$rundir" ] && [ -s "$rundir/result.md" ]; then
          fail_kill error "died mid-stream ($status_line)"
        else
          fail_kill no-jsonl "died with no events ($status_line)"
        fi ;;
      *no-rc*)                 fail_kill no-jsonl "poll $status_line" ;;
      *no-pid*|*handle=broken*)
        # Dispatch handle missing/broken — process already gone, nothing to kill.
        write_outcome FAIL dispatch-broken "" "(all): poll $status_line" "-" "-"
        say "FAIL dispatch-broken"
        exit 1 ;;
      STATUS=FAIL*)            fail_kill error "poll $status_line" ;;
      *)                       fail_kill poll-unknown "poll unknown ($status_line)" ;;
    esac
  done

  # Exhausted rounds without DONE.
  "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
  local pm; pm=$(do_postmortem)
  write_outcome FAIL poll-ceiling "" "(all): poll loop ceiling (70 rounds)" "$pm" "-"
  say "FAIL poll ceiling"
  exit 1
}

dispatch_and_poll

# -------- 6. escalation -------------------------------------------------

if [ -s "$ESCALATE_FILE" ]; then
  # Bounded read for header inspection (don't pull content into outcome).
  head -80 "$ESCALATE_FILE" > "$SHARD_SESSION/escalate-snippet.md" 2>/dev/null || true
  local_names=$(shard_contract_names | awk '{print $0 ": escalate"}')
  write_outcome NEEDS_REPLAN escalate "" "$local_names" "-" "-"
  say "NEEDS_REPLAN escalate"
  exit 2
fi

# -------- 7. gate 1: report file ---------------------------------------

if [ ! -s "$REPORT_FILE" ]; then
  pm=$(do_postmortem)
  write_outcome FAIL report-malformed "" "(all): report missing/empty" "$pm" "-"
  say "FAIL gate1 report missing"
  exit 1
fi

report_head=$(head -20 "$REPORT_FILE")
if ! echo "$report_head" | grep -q '^## Summary' || \
   ! echo "$report_head" | grep -q '^## Completed'; then
  pm=$(do_postmortem)
  write_outcome FAIL report-malformed "" "(all): report missing ## Summary or ## Completed in head -20" "$pm" "-"
  say "FAIL gate1 malformed"
  exit 1
fi
say "gate 1 ok"

# -------- 8. survivors: contracts this shard both declared and reported done ----
# Survivors = (declared in this shard) ∩ (claimed Completed in the report).
# The former "gate 2 grep guard" -- which matched each contract's prose `expect`
# from contracts.json literally against the test source -- was removed: it
# mechanically checked a non-deterministic validation question (does this test
# capture the intent?), a category error that spuriously demoted virtually every
# well-written test. Verification ("do the tests pass") is gate 3's deterministic
# job; whether the tests meaningfully cover the contract is a judgement for the
# Review phase, not a per-shard grep.

declared_names=$(shard_contract_names)
survivors=""
for cname in $(completed_contracts); do
  if echo "$declared_names" | grep -qxF "$cname"; then
    survivors="$survivors${survivors:+
}$cname"
  fi
done
say "survivors=$(echo "$survivors" | grep -c . || true)"

# -------- 9. gate 3: test execution (with at most one re-dispatch) -----

# cf-pi-test.sh prints "test_exit=<n>" and exits with that code. We use exit code directly.
# TEST_RUNNER is intentionally word-split (e.g. "npm test", "cargo test --lib").
# shellcheck disable=SC2086
set +e
"$SCRIPTS/cf-pi-test.sh" "$SHARD_SESSION" $TEST_RUNNER > "$SHARD_SESSION/gate3.out" 2>&1
TEST_RC=$?
set -e

if [ "$TEST_RC" -ne 0 ]; then
  # Distinguish "tests failed" from "test runner errored".
  if grep -q '^test_exit=' "$SHARD_SESSION/gate3.out"; then
    # Cheap retest before the expensive re-dispatch: a first-run failure is often an
    # environment transient (parallel shards colliding on a shared port/service), not
    # OMP's code. Re-dispatching OMP for those wastes a full dispatch+poll cycle.
    say "gate 3 first run failed (rc=$TEST_RC), retesting once before re-dispatch"
    set +e
    "$SCRIPTS/cf-pi-test.sh" "$SHARD_SESSION" $TEST_RUNNER > "$SHARD_SESSION/gate3-retest.out" 2>&1
    RETEST_RC=$?
    set -e
    if [ "$RETEST_RC" -eq 0 ]; then
      say "gate 3 retest passed — first failure was an environment transient"
      TEST_RC=0
    fi
  fi
fi

if [ "$TEST_RC" -ne 0 ]; then
  if grep -q '^test_exit=' "$SHARD_SESSION/gate3.out"; then
    # Test runner ran; tests failed twice. One re-dispatch allowed.
    say "gate 3 failed twice (rc=$TEST_RC), re-briefing pi"
    REBRIEF_FILE="$SHARD_SESSION/re-brief.md"
    {
      printf '## Previous run feedback\n'
      printf 'The orchestrator ran the test suite and it failed. Inspect the failures and fix. Fold each fix into that contract'\''s EXISTING commit instead of adding fixup commits: `git commit --amend` if it is the branch tip, otherwise `git commit --fixup=<that commit> && GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash %s`. This branch is a private worktree; rewriting it is safe. Then print DONE.\n\n' "$BASE_HEAD"
      printf '### Test output tail (last 30 lines)\n```\n'
      tail -30 "$SHARD_SESSION/gate3-retest.out" 2>/dev/null || tail -30 "$SHARD_SESSION/gate3.out"
      printf '\n```\n'
    } > "$REBRIEF_FILE"
    # Also append to the brief: the fresh-dispatch fallback (no prior session id)
    # re-sends the whole brief, which must then carry the feedback too.
    { printf '\n\n'; cat "$REBRIEF_FILE"; } >> "$BRIEF_FILE"

    # Re-dispatch resumes the prior OMP session with only the feedback as the new
    # prompt -- OMP keeps its working context instead of a cold start.
    # dispatch_and_poll exits on failure paths; on DONE returns.
    dispatch_and_poll "$REBRIEF_FILE"

    set +e
    "$SCRIPTS/cf-pi-test.sh" "$SHARD_SESSION" $TEST_RUNNER > "$SHARD_SESSION/gate3-retry.out" 2>&1
    TEST_RC=$?
    set -e

    if [ "$TEST_RC" -ne 0 ]; then
      # Persistent failure => NEEDS_REPLAN, all this shard's contracts affected.
      affected=$(shard_contract_names | awk '{print $0 ": gate3 test fail (persistent)"}')
      pm=$(do_postmortem)
      write_outcome NEEDS_REPLAN test-fail-persistent "$survivors" "$affected" "$pm" "-"
      say "NEEDS_REPLAN test-fail-persistent"
      exit 2
    fi
  else
    # No test_exit marker => test runner errored (compile/setup fail).
    pm=$(do_postmortem)
    write_outcome FAIL "test runner error" "" "(all): test runner errored before test_exit" "$pm" "-"
    say "FAIL test runner error"
    exit 1
  fi
fi
say "gate 3 ok"

# -------- 10. actual ⊆ declared file scope -----------------------------

declared_files=$(jq -r --arg sid "$SHARD_ID" '.groups[$sid].files[]' "$SHARDS_FILE" | sort -u)
actual_files=$(git -C "$WORK" diff --name-only "$BASE_HEAD"...HEAD 2>/dev/null | sort -u)

undeclared=""
if [ -n "$actual_files" ]; then
  undeclared=$(comm -23 <(printf '%s\n' "$actual_files") <(printf '%s\n' "$declared_files") || true)
fi

# Build/lock manifests are legitimately touched when the isolated worktree must
# add a missing dev dep to run the tests (e.g. `uv add --dev pytest`). Treat
# them as a warning, not a scope violation.
BUILD_LOCK_ALLOWLIST='^(pyproject\.toml|uv\.lock|requirements[^/]*\.txt|package\.json|package-lock\.json|bun\.lock(b)?|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$'
allowlisted=""
if [ -n "$undeclared" ]; then
  allowlisted=$(printf '%s\n' "$undeclared" | grep -E "$BUILD_LOCK_ALLOWLIST" || true)
  undeclared=$(printf '%s\n' "$undeclared" | grep -vE "$BUILD_LOCK_ALLOWLIST" || true)
fi
if [ -n "$allowlisted" ]; then
  say "WARN undeclared build/lock files (allowlisted): $(printf '%s' "$allowlisted" | tr '\n' ',' | sed 's/,$//')"
fi

if [ -n "$undeclared" ]; then
  undecl_csv=$(printf '%s' "$undeclared" | tr '\n' ',' | sed 's/,$//')
  affected=$(shard_contract_names | awk '{print $0 ": gate-scope undeclared_file_touched"}')
  write_outcome NEEDS_REPLAN undeclared_file_touched "$survivors" "$affected" "-" "$undecl_csv"
  say "NEEDS_REPLAN undeclared_file_touched ($undecl_csv)"
  exit 2
fi

# -------- 11. capture diff ---------------------------------------------

git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
git -C "$WORK" diff "$BASE_HEAD" > "$DIFF_FILE" 2>/dev/null || true

# -------- 12. write PASS outcome ---------------------------------------

# All contracts this shard declared + reported survived (gates 1+3 ok, scope ok).
# Allowlisted build/lock touches (if any) surface in undeclared_files for review.
allow_csv="-"
[ -n "$allowlisted" ] && allow_csv=$(printf '%s' "$allowlisted" | tr '\n' ',' | sed 's/,$//')
write_outcome PASS none "$survivors" "" "-" "$allow_csv"
say "PASS"
exit 0
