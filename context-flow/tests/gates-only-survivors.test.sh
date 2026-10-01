#!/usr/bin/env bash
# When a Claude builder escalates while fixing failed tests, --gates-only keeps
# the contracts its gate-1-valid report already finished in Survived contracts,
# so Plan preserves them. Without a recorded tests re-brief it lists none, as the
# full mode does before gate 1. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

survived() { sed -n '/^## Survived contracts/,/^## Affected/p' "$SHARD/outcome.md"; }
reason_of() { sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md"; }

# T1: tests re-brief recorded, then the builder escalates
fx_build
fx_report valid
fx_escalate
echo tests > "$SHARD/rebriefs"
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "2" "$RC" "T1 exit"
assert_eq "escalate" "$(reason_of)" "T1 Reason"
assert_contains "$(survived)" "- C1" "T1 C1 survives"
fx_clean

# T2: no tests re-brief recorded -> nothing survives
fx_build
fx_report valid
fx_escalate
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "2" "$RC" "T2 exit"
assert_eq "- (none)" "$(survived | sed -n 2p)" "T2 Survived is (none)"
fx_clean
