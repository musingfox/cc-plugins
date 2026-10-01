#!/usr/bin/env bash
# cf-pi-run.sh --gates-only hands a suite that is red on its first run and its
# retest back to the Claude builder once per round (REBRIEF tests, exit 3, no
# outcome.md); the next call runs the suite exactly once more. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

status_of() { sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md"; }
reason_of() { sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md"; }
count_of() { wc -l < "$1" 2>/dev/null | tr -d ' '; }

first_round() {
  fx_build
  fx_report valid
  fx_test_mode red
  fx_run --gates-only "$SHARD" goal none "$RUNNER"
}

# T1: red twice -> re-brief handed back
first_round
assert_eq "3" "$RC" "T1 exit"
assert_eq "REBRIEF tests $SHARD/re-brief.md" "$(fx_last)" "T1 last stdout line"
assert_eq "2" "$(count_of "$FLOW/test.count")" "T1 suite ran twice (first + retest)"
assert_eq absent "$(fx_exists "$SHARD/outcome.md")" "T1 no outcome.md"
assert_contains "$(cat "$SHARD/implement-brief.md")" "Previous run feedback" "T1 feedback appended to brief"
assert_contains "$(cat "$SHARD/rebriefs")" "tests" "T1 rebriefs records tests"

# T2: still red on re-entry -> persistent, one more run, survivors kept
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "2" "$RC" "T2 exit"
assert_eq "test-fail-persistent" "$(reason_of)" "T2 Reason"
assert_eq "3" "$(count_of "$FLOW/test.count")" "T2 exactly one more run"
assert_eq present "$(fx_exists "$SHARD/gate3-retry.out")" "T2 gate3-retry.out written"
assert_contains "$(sed -n '/^## Survived contracts/,/^## Affected/p' "$SHARD/outcome.md")" "C1" "T2 survivors list C1"
fx_clean

# T3: green on re-entry -> continues to PASS
first_round
fx_test_mode green
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T3 exit"
assert_eq "PASS" "$(status_of)" "T3 Status"
assert_eq "3" "$(count_of "$FLOW/test.count")" "T3 exactly one more run"
fx_clean

# T4: no test_exit marker -> runner error, no re-brief
fx_build
fx_report valid
fx_test_mode nomarker
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "1" "$RC" "T4 exit"
assert_eq "test runner error" "$(reason_of)" "T4 Reason"
assert_eq absent "$(fx_exists "$SHARD/rebriefs")" "T4 nothing recorded in rebriefs"
fx_clean
