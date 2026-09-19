#!/usr/bin/env bash
# Pins derive_cause's reason→artifact mapping (cf-pi-run.sh): the cause line
# must come from the artifact that matches the failure reason — a plausible
# cause from the wrong artifact is worse than none.

. "$CF_TESTS_DIR/lib/assert.sh"

# Extract the function (and the JSONL resolver it calls) from cf-pi-run.sh and
# load them with stub env.
eval "$(sed -n '/^newest_jsonl()/,/^}/p;/^derive_cause()/,/^}/p' "$CF_TESTS_DIR/../scripts/cf-pi-run.sh")"

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

# T6: after a resume the new run dir has no JSONL — the evidence is in the run
# dir the resume replaced, so the previous one must stay in the search.
mkdir -p "$SHARD_SESSION/new-run/sessions" "$SHARD_SESSION/old-run/sessions"
printf '{"errorMessage":"stalled mid-resume"}\n' > "$SHARD_SESSION/old-run/sessions/a.jsonl"
printf '%s\n' "$SHARD_SESSION/new-run" > "$SHARD_SESSION/pi-rundir"
printf '%s\n' "$SHARD_SESSION/old-run" > "$SHARD_SESSION/pi-rundir-prev"
rm -f "$PI_SESSION_DIR"/*.jsonl
assert_contains "$(derive_cause FAIL stall)" "stalled mid-resume" \
  "T6: cause falls back to the run dir the resume replaced"

# T7: a refused dispatch -> the pi-dispatch refusal line, else the last
# stderr line, else the exit code
printf 'banner\npi-dispatch: refused\ntrailer\n' > "$SHARD_SESSION/dispatch.stderr"
assert_eq "pi-dispatch: refused" "$(derive_cause FAIL dispatch-refused)" \
  "T7: dispatch-refused cause is the pi-dispatch line"
printf 'first\nlast words\n\n' > "$SHARD_SESSION/dispatch.stderr"
assert_eq "last words" "$(derive_cause FAIL dispatch-refused)" \
  "T7: without a pi-dispatch line, the last non-empty line"
: > "$SHARD_SESSION/dispatch.stderr"
DISPATCH_RC=2
assert_eq "cf-pi-dispatch exited 2" "$(derive_cause FAIL dispatch-refused)" \
  "T7: with no stderr at all, the exit code"

# T8: a sibling stopped by another shard's quota wall -> names that shard
FLOW_SESSION="$SHARD_SESSION"
printf 'TAG=QUOTA\nSHARD=A\nEPOCH=1\n' > "$FLOW_SESSION/quota-wall"
SHARD_ID=B
assert_eq "QUOTA wall hit by shard A" "$(derive_cause FAIL QUOTA)" \
  "T8: a sibling's quota cause names the shard that hit the wall"

rm -rf "$SHARD_SESSION"
