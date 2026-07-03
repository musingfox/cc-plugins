#!/usr/bin/env bash
# Pins derive_cause's reason→artifact mapping (cf-pi-run.sh): the cause line
# must come from the artifact that matches the failure reason — a plausible
# cause from the wrong artifact is worse than none.

. "$CF_TESTS_DIR/lib/assert.sh"

# Extract the function from cf-pi-run.sh and load it with stub env.
eval "$(sed -n '/^derive_cause()/,/^}/p' "$CF_TESTS_DIR/../scripts/cf-pi-run.sh")"

SHARD_SESSION="$(mktemp -d)"
PI_SESSION_DIR="$SHARD_SESSION/pi-sessions"; mkdir -p "$PI_SESSION_DIR"
ESCALATE_FILE="$SHARD_SESSION/escalate.md"
TEST_LOG="$SHARD_SESSION/test-output.log"

# T1: PASS -> empty cause
assert_eq "" "$(derive_cause PASS none)" "T1: PASS yields no cause"

# T2: escalate reason -> Blocker line from escalate.md
printf '## Blocker\ncontract X contradicts contract Y\n\n## Affected contracts\n- X\n' > "$ESCALATE_FILE"
assert_eq "contract X contradicts contract Y" \
  "$(derive_cause NEEDS_REPLAN escalate)" "T2: escalate cause = Blocker line"

# T3: test-fail reason -> first failure line from test log, NOT the escalate file
printf 'collected 3 items\nFAILED test_foo.py::test_bar - AssertionError\n' > "$TEST_LOG"
assert_eq "FAILED test_foo.py::test_bar - AssertionError" \
  "$(derive_cause NEEDS_REPLAN test-fail-persistent)" "T3: test-fail cause from test log"

# T4: undeclared_file_touched -> fixed pointer, never a stray test-log line
assert_eq "scope violation — see undeclared_files below" \
  "$(derive_cause NEEDS_REPLAN undeclared_file_touched)" "T4: scope violation cause is fixed text"

# T5: infra reason -> errorMessage from newest JSONL
printf '{"type":"message","errorMessage":"usage_limit_reached"}\n' > "$PI_SESSION_DIR/a.jsonl"
assert_contains "$(derive_cause FAIL stall)" "usage_limit_reached" \
  "T5: infra cause from JSONL errorMessage"

rm -rf "$SHARD_SESSION"
