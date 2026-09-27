#!/usr/bin/env bash
# Pins cf.md's Claude fallback (§3.6): it prepares the shard itself and passes
# the same revert gate as the OMP path, on the recorded shard runner.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

shard_step=$(awk '/^### 3\.1/ {p=1} /^### 3\.2/ {exit} p' "$CFMD")
fallback=$(awk '/^### 3\.6/ {p=1} /^## Phase 4/ {exit} p' "$CFMD")

first_line() {
  printf '%s\n' "$fallback" | grep -n -m1 -F -- "$1" | cut -d: -f1
}

# T1
assert_contains "$shard_step" 'SHARD_TEST_RUNNER=%s' "§3.1 records SHARD_TEST_RUNNER in the session env"

# T2
assert_contains "$fallback" 'cf-pi-prepare.sh' "§3.6 prepares the shard with cf-pi-prepare.sh"
assert_eq "0" "$(printf '%s\n' "$fallback" | grep -cF 'already in place' || true)" \
  "§3.6 no longer assumes the worktree and brief are already in place"

# T3
for token in 'cf-pi-revert-gate.sh' 'run_in_background: true' '$SHARD_TEST_RUNNER' 'revert-gate.out'; do
  assert_contains "$fallback" "$token" "§3.6 revert gate step names $token"
done

# T4
for token in 'STAYS_GREEN' 'tests-green-on-revert' 'revert-gate-error'; do
  assert_contains "$fallback" "$token" "§3.6 maps the revert gate verdict: $token"
done

# T5
scope_ln=$(first_line 'cf-pi-scope.sh')
gate_ln=$(first_line 'cf-pi-revert-gate.sh')
if [ -n "$scope_ln" ] && [ -n "$gate_ln" ] && [ "$scope_ln" -lt "$gate_ln" ]; then
  assert_eq "order" "order" "§3.6 runs the scope gate before the revert gate"
else
  assert_eq "scope<revert" "$scope_ln,$gate_ln" "§3.6 runs the scope gate before the revert gate"
fi

# T6
if bash "$CF_TESTS_DIR/cf-md-quota-routing.test.sh" >/dev/null; then
  assert_eq "ok" "ok" "cf-md-quota-routing.test.sh still ok"
else
  assert_eq "ok" "fail" "cf-md-quota-routing.test.sh still ok"
fi
