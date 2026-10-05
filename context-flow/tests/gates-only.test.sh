#!/usr/bin/env bash
# cf-pi-run.sh --gates-only runs lifecycle steps 6-13 on a Claude builder's
# commits and report, ending in the same outcome.md as the OMP path, without
# preparing, probing, dispatching or polling. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"
. "$CF_TESTS_DIR/lib/wired-shard.sh"

status_of() { sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md"; }
reason_of() { sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md"; }

# T1: stub fixture, valid report, stale outcome -> PASS, nothing dispatched
fx_build
fx_report valid
fx_stale_outcome
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T1 exit"
assert_eq "PASS" "$(status_of)" "T1 Status"
assert_eq present "$(fx_exists "$SHARD/implement-report.md")" "T1 report kept"
for f in probe dispatch worktree brief; do
  assert_eq absent "$(fx_exists "$FLOW/$f.count")" "T1 $f never ran"
done
fx_clean

# T2: escalate.md -> NEEDS_REPLAN escalate, blocker kept
fx_build
fx_report valid
fx_escalate
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "2" "$RC" "T2 exit"
assert_eq "escalate" "$(reason_of)" "T2 Reason"
assert_eq present "$(fx_exists "$SHARD/escalate.md")" "T2 escalate.md kept"
fx_clean

# T3: wired, real git, no stubs
wired_build
assert_eq "0" "$PREP_RC" "T3 prepare-only exit"
wired_gates "$REAL_SCRIPTS/cf-pi-run.sh" 'bash tests/x.test.sh'
assert_eq "0" "$RC" "T3 gates-only exit"
assert_eq "PASS" "$(sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md")" "T3 Status"
assert_eq "CLEAN 1" "$(head -1 "$SHARD/revert-gate.out")" "T3 revert gate verdict"
assert_eq "$BASE_SHA" "$(git -C "$REPO" rev-parse HEAD)" "T3 host repo HEAD unchanged"
wired_clean

# T4: unknown leading flag
fx_build
fx_run --bogus "$SHARD" goal none true
assert_eq "1" "$RC" "T4 exit"
assert_contains "$(cat "$FLOW/run.err")" "Usage:" "T4 usage on stderr"
fx_clean
