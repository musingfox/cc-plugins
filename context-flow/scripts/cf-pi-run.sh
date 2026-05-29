#!/usr/bin/env bash
# Full Phase-3 lifecycle for ONE shard, end-to-end, in pure shell.
# The Claude pi-driver sub-agent invokes this and only reads the resulting
# OUTCOME_FILE -- it never sees brief/report/JSONL/test logs directly.
#
# Usage:   cf-pi-run.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER
# Stdout:  operator-facing progress lines (one per major event)
# Writes:  $BRIEF_FILE, $REPORT_FILE (Pi), $ESCALATE_FILE (Pi optional),
#          $DIFF_FILE, $OUTCOME_FILE (this script -- structured outcome)
# Exit:    0 = PASS, 1 = FAIL, 2 = NEEDS_REPLAN
#
# Lifecycle (in order):
#   1. cf-pi-worktree.sh     create worktree + branch (BEFORE brief, so brief's
#                            Environment block can include WORK/CF_BRANCH/BASE_HEAD)
#   2. cf-pi-brief.sh        assemble brief
#   3. cf-pi-probe.sh        liveness probe
#   4. cf-pi-dispatch.sh     background Pi
#   5. poll loop             cf-pi-poll.sh once per ~30s, max 70 rounds
#   6. escalation detect     $ESCALATE_FILE present => NEEDS_REPLAN
#   7. gate 1 report         head -20 contains ## Summary && ## Completed
#   8. gate 2 grep guard     each Completed contract's non-trivial test expects
#                            must grep-hit some test file in $WORK
#   9. gate 3 test execute   cf-pi-test.sh; one in-shard re-dispatch on fail
#  10. actual ⊆ declared     git diff name-only ⊆ shard's declared files
#  11. capture diff          git diff $BASE_HEAD > $DIFF_FILE
#  12. write OUTCOME_FILE    structured result for pi-driver

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
  local newest; newest=$(ls -t "$PI_SESSION_DIR"/*.jsonl 2>/dev/null | head -1 || true)
  [ -n "$newest" ] && jsonl_path="$newest"

  local esc_path="-"
  [ -s "$ESCALATE_FILE" ] && esc_path="$ESCALATE_FILE"

  local report_path="-"
  [ -s "$REPORT_FILE" ] && report_path="$REPORT_FILE"

  local diff_path="-"
  [ -s "$DIFF_FILE" ] && diff_path="$DIFF_FILE"

  local test_log_path="-"
  [ -s "$TEST_LOG" ] && test_log_path="$TEST_LOG"

  {
    printf '## Status\n%s\n\n' "$status"
    printf '## Reason\n%s\n\n' "$reason"
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
}

# Names of contracts declared in this shard (newline-sep).
shard_contract_names() {
  jq -r --arg sid "$SHARD_ID" '.groups[$sid].contracts[]' "$SHARDS_FILE"
}

# Extract Completed-claimed contract names from $REPORT_FILE.
# Pi protocol uses "_(contract: Name)_" suffix on each Completed bullet.
completed_contracts() {
  # Pull only the lines inside ## Completed section.
  sed -n '/^## Completed/,/^## /p' "$REPORT_FILE" \
    | grep -oE '_\(contract: [^)]+\)_' \
    | sed -E 's/^_\(contract: (.+)\)_$/\1/' \
    | awk '!seen[$0]++'
}

# Non-trivial expected values for a contract (skip empty/numeric/bracket-only).
contract_expects() {
  local name="$1"
  jq -r --arg n "$name" '
    .contracts[] | select(.name == $n) |
    (.test_cases // [])[] | .expect // ""
  ' "$CONTRACTS_FILE" \
    | awk 'length($0) >= 3 && !/^[0-9[:space:]]+$/ && !/^[\[\](){}'\''"`,. ]+$/'
}

# Candidate test file paths inside $WORK for a contract: from touches_files,
# filter to entries containing "test", ".test.", or "spec." -- absolutized.
contract_test_files() {
  local name="$1"
  jq -r --arg n "$name" '
    .contracts[] | select(.name == $n) |
    (.touches_files // [])[]
  ' "$CONTRACTS_FILE" \
    | grep -E '(^|/)test(s)?/|\.test\.|\.spec\.|_test\.' \
    | while IFS= read -r rel; do
        [ -z "$rel" ] && continue
        echo "$WORK/$rel"
      done
}

# Run cf-pi-postmortem.sh and stash output as a file path. Returns the path.
do_postmortem() {
  local out="$SHARD_SESSION/postmortem.log"
  "$SCRIPTS/cf-pi-postmortem.sh" "$SHARD_SESSION" > "$out" 2>&1 || true
  echo "$out"
}

# -------- 1. worktree (MUST run before brief so BASE_HEAD/CF_BRANCH/WORK
#               appear correctly in the brief's Environment block) -----

echo "[shard $SHARD_ID] setting up worktree"
"$SCRIPTS/cf-pi-worktree.sh" "$SHARD_SESSION" >/dev/null

# Worktree appended REPO_ROOT/BASE_BRANCH/BASE_HEAD to env.sh; re-source.
load_cf_pi_env "$SHARD_SESSION"
load_cf_flow_env "$FLOW_SESSION"

# -------- 2. brief ------------------------------------------------------

echo "[shard $SHARD_ID] assembling brief"
if ! "$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "$GOAL" "$CONSTRAINTS" "$TEST_RUNNER" >/dev/null; then
  write_outcome FAIL brief-assembly "" "" "-" "-"
  echo "[shard $SHARD_ID] FAIL brief-assembly"
  exit 1
fi

# -------- 3. probe ------------------------------------------------------

echo "[shard $SHARD_ID] probing pi"
PROBE_STATUS=$("$SCRIPTS/cf-pi-probe.sh" "$SHARD_SESSION")
case "$PROBE_STATUS" in
  OK*)
    echo "[shard $SHARD_ID] probe ok"
    ;;
  NO_JSONL*)
    write_outcome FAIL probe-error "" "(all): probe NO_JSONL" "-" "-"
    echo "[shard $SHARD_ID] FAIL probe NO_JSONL"
    exit 1
    ;;
  ERROR:*)
    write_outcome FAIL probe-error "" "(all): probe $PROBE_STATUS" "-" "-"
    echo "[shard $SHARD_ID] FAIL probe $PROBE_STATUS"
    exit 1
    ;;
  *)
    write_outcome FAIL probe-error "" "(all): probe unknown ($PROBE_STATUS)" "-" "-"
    echo "[shard $SHARD_ID] FAIL probe unknown: $PROBE_STATUS"
    exit 1
    ;;
esac

# -------- 4-5. dispatch + poll (factored so step 9 can re-dispatch) -----

dispatch_and_poll() {
  echo "[shard $SHARD_ID] dispatching pi"
  local pi_pid
  pi_pid=$("$SCRIPTS/cf-pi-dispatch.sh" "$SHARD_SESSION")
  echo "[shard $SHARD_ID] pi pid=$pi_pid"

  local round=0
  local max_rounds=70
  while [ "$round" -lt "$max_rounds" ]; do
    round=$((round + 1))
    sleep 30
    local status_line
    status_line=$("$SCRIPTS/cf-pi-poll.sh" "$SHARD_SESSION" 2>&1)
    local first
    first=$(echo "$status_line" | awk '{print $1}')
    echo "[shard $SHARD_ID] round $round/$max_rounds status=$status_line"

    case "$first" in
      ALIVE|NO_JSONL)
        continue
        ;;
      DONE)
        return 0
        ;;
      NO_JSONL_FAIL)
        "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
        local pm; pm=$(do_postmortem)
        write_outcome FAIL stall "" "(all): poll NO_JSONL_FAIL" "$pm" "-"
        echo "[shard $SHARD_ID] FAIL NO_JSONL_FAIL"
        exit 1
        ;;
      STALL)
        "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
        local pm; pm=$(do_postmortem)
        write_outcome FAIL stall "" "(all): poll STALL" "$pm" "-"
        echo "[shard $SHARD_ID] FAIL STALL"
        exit 1
        ;;
      ERROR)
        "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
        local pm; pm=$(do_postmortem)
        write_outcome FAIL stall "" "(all): poll ERROR ($status_line)" "$pm" "-"
        echo "[shard $SHARD_ID] FAIL ERROR"
        exit 1
        ;;
      TIMEOUT)
        "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
        local pm; pm=$(do_postmortem)
        write_outcome FAIL stall "" "(all): poll TIMEOUT" "$pm" "-"
        echo "[shard $SHARD_ID] FAIL TIMEOUT"
        exit 1
        ;;
      NO_PID)
        write_outcome FAIL dispatch-broken "" "(all): poll NO_PID" "-" "-"
        echo "[shard $SHARD_ID] FAIL dispatch-broken"
        exit 1
        ;;
      *)
        "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
        local pm; pm=$(do_postmortem)
        write_outcome FAIL stall "" "(all): poll unknown ($status_line)" "$pm" "-"
        echo "[shard $SHARD_ID] FAIL poll unknown: $status_line"
        exit 1
        ;;
    esac
  done

  # Exhausted rounds without DONE.
  "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
  local pm; pm=$(do_postmortem)
  write_outcome FAIL stall "" "(all): poll loop ceiling (70 rounds)" "$pm" "-"
  echo "[shard $SHARD_ID] FAIL poll ceiling"
  exit 1
}

dispatch_and_poll

# -------- 6. escalation -------------------------------------------------

if [ -s "$ESCALATE_FILE" ]; then
  # Bounded read for header inspection (don't pull content into outcome).
  head -80 "$ESCALATE_FILE" > "$SHARD_SESSION/escalate-snippet.md" 2>/dev/null || true
  local_names=$(shard_contract_names | awk '{print $0 ": escalate"}')
  write_outcome NEEDS_REPLAN escalate "" "$local_names" "-" "-"
  echo "[shard $SHARD_ID] NEEDS_REPLAN escalate"
  exit 2
fi

# -------- 7. gate 1: report file ---------------------------------------

if [ ! -s "$REPORT_FILE" ]; then
  pm=$(do_postmortem)
  write_outcome FAIL report-malformed "" "(all): report missing/empty" "$pm" "-"
  echo "[shard $SHARD_ID] FAIL gate1 report missing"
  exit 1
fi

report_head=$(head -20 "$REPORT_FILE")
if ! echo "$report_head" | grep -q '^## Summary' || \
   ! echo "$report_head" | grep -q '^## Completed'; then
  pm=$(do_postmortem)
  write_outcome FAIL report-malformed "" "(all): report missing ## Summary or ## Completed in head -20" "$pm" "-"
  echo "[shard $SHARD_ID] FAIL gate1 malformed"
  exit 1
fi
echo "[shard $SHARD_ID] gate 1 ok"

# -------- 8. gate 2: grep guard ----------------------------------------

declared_names=$(shard_contract_names)
claimed_names=$(completed_contracts)

# Survivors after gate 2; demoted go to affected list.
gate2_survivors=""
gate2_demoted=""

for cname in $claimed_names; do
  # Only consider names that belong to this shard.
  if ! echo "$declared_names" | grep -qxF "$cname"; then
    continue
  fi

  expects=$(contract_expects "$cname")
  if [ -z "$expects" ]; then
    # No non-trivial expects -- grep guard cannot fire; pass through.
    gate2_survivors="$gate2_survivors${gate2_survivors:+
}$cname"
    continue
  fi

  test_files=$(contract_test_files "$cname")
  if [ -z "$test_files" ]; then
    gate2_demoted="$gate2_demoted${gate2_demoted:+
}$cname: gate2 no candidate test file in touches_files"
    continue
  fi

  hit=0
  while IFS= read -r expect_val; do
    [ -z "$expect_val" ] && continue
    while IFS= read -r tf; do
      [ -z "$tf" ] && continue
      [ -f "$tf" ] || continue
      if grep -q -F -- "$expect_val" "$tf"; then
        hit=1
        break 2
      fi
    done <<< "$test_files"
  done <<< "$expects"

  if [ "$hit" -eq 1 ]; then
    gate2_survivors="$gate2_survivors${gate2_survivors:+
}$cname"
  else
    gate2_demoted="$gate2_demoted${gate2_demoted:+
}$cname: gate2 no test assertion matched non-trivial expects"
  fi
done
echo "[shard $SHARD_ID] gate 2 ok (survivors=$(echo "$gate2_survivors" | grep -c . || true) demoted=$(echo "$gate2_demoted" | grep -c . || true))"

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
    # Test runner ran; some tests failed. One re-dispatch allowed.
    echo "[shard $SHARD_ID] gate 3 first run failed (rc=$TEST_RC), appending failure detail and re-dispatching"
    {
      printf '\n\n## Previous run feedback\n'
      printf 'The orchestrator ran the test suite and it failed. Inspect the failures, fix, re-commit per-contract, then print DONE.\n\n'
      printf '### Test output tail (last 30 lines)\n```\n'
      tail -30 "$SHARD_SESSION/gate3.out"
      printf '\n```\n'
    } >> "$BRIEF_FILE"

    # Re-dispatch. dispatch_and_poll exits on failure paths; on DONE returns.
    dispatch_and_poll

    set +e
    "$SCRIPTS/cf-pi-test.sh" "$SHARD_SESSION" $TEST_RUNNER > "$SHARD_SESSION/gate3-retry.out" 2>&1
    TEST_RC=$?
    set -e

    if [ "$TEST_RC" -ne 0 ]; then
      # Persistent failure => NEEDS_REPLAN, all this shard's contracts affected.
      affected=$(shard_contract_names | awk '{print $0 ": gate3 test fail (persistent)"}')
      pm=$(do_postmortem)
      write_outcome NEEDS_REPLAN test-fail-persistent "$gate2_survivors" "$affected" "$pm" "-"
      echo "[shard $SHARD_ID] NEEDS_REPLAN test-fail-persistent"
      exit 2
    fi
  else
    # No test_exit marker => test runner errored (compile/setup fail).
    pm=$(do_postmortem)
    write_outcome FAIL "test runner error" "" "(all): test runner errored before test_exit" "$pm" "-"
    echo "[shard $SHARD_ID] FAIL test runner error"
    exit 1
  fi
fi
echo "[shard $SHARD_ID] gate 3 ok"

# -------- 10. actual ⊆ declared file scope -----------------------------

declared_files=$(jq -r --arg sid "$SHARD_ID" '.groups[$sid].files[]' "$SHARDS_FILE" | sort -u)
actual_files=$(git -C "$WORK" diff --name-only "$BASE_HEAD"...HEAD 2>/dev/null | sort -u)

undeclared=""
if [ -n "$actual_files" ]; then
  undeclared=$(comm -23 <(printf '%s\n' "$actual_files") <(printf '%s\n' "$declared_files") || true)
fi

if [ -n "$undeclared" ]; then
  undecl_csv=$(printf '%s' "$undeclared" | tr '\n' ',' | sed 's/,$//')
  affected=$(shard_contract_names | awk '{print $0 ": gate-scope undeclared_file_touched"}')
  write_outcome NEEDS_REPLAN undeclared_file_touched "$gate2_survivors" "$affected" "-" "$undecl_csv"
  echo "[shard $SHARD_ID] NEEDS_REPLAN undeclared_file_touched ($undecl_csv)"
  exit 2
fi

# -------- 11. capture diff ---------------------------------------------

git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
git -C "$WORK" diff "$BASE_HEAD" > "$DIFF_FILE" 2>/dev/null || true

# -------- 12. write PASS outcome ---------------------------------------

# Final survived list = gate2 survivors, plus demoted entries pushed to affected.
write_outcome PASS none "$gate2_survivors" "$gate2_demoted" "-" "-"
echo "[shard $SHARD_ID] PASS"
exit 0
