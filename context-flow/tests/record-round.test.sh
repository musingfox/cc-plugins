#!/usr/bin/env bash
# Tests for RecordRoundState contract via cf-pi-record-round.sh
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

# T1: fresh flow session, --round 1 --result A=PASS --result B=NEEDS_REPLAN
# expect dispatch-state.json has .results_latest.A == "PASS" etc, .current_round == 1
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS --result B=NEEDS_REPLAN
assert_json "$FLOW_SESSION/dispatch-state.json" '.results_latest.A' "PASS" "T1 results_latest.A"
assert_json "$FLOW_SESSION/dispatch-state.json" '.results_latest.B' "NEEDS_REPLAN" "T1 results_latest.B"
assert_json "$FLOW_SESSION/dispatch-state.json" '.current_round' "1" "T1 current_round"
rm -rf "$FLOW_SESSION"

# T2: second invocation --round 2 --result B=PASS on state that had round 1
# expect archive gains line .round==1; state .current_round==2
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 2 --result B=PASS
assert_json "$FLOW_SESSION/dispatch-state.json" '.current_round' "2" "T2 current_round"
line_count=$(wc -l < "$FLOW_SESSION/dispatch-state-archive.jsonl" 2>/dev/null | tr -d ' ' || echo 0)
assert_eq "1" "$line_count" "T2 archive has one line"
assert_json "$FLOW_SESSION/dispatch-state-archive.jsonl" '.round' "1" "T2 archive round"
rm -rf "$FLOW_SESSION"

# T3: --result B=NEEDS_REPLAN repeated across two rounds for contract Foo
# expect .replan_count.Foo increments
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result Foo=NEEDS_REPLAN
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 2 --result Foo=NEEDS_REPLAN
replan=$(jq -r '.replan_count.Foo' "$FLOW_SESSION/dispatch-state.json")
assert_eq "2" "$replan" "T3 replan_count.Foo == 2"
rm -rf "$FLOW_SESSION"

# T3b: positional FLOW_SESSION (the /cf command-doc calling convention) works
# without the env var and wins over an env-set value.
pos_session="$(mktemp -d)"
env -u FLOW_SESSION "$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" "$pos_session" --round 1 --result A=PASS
assert_json "$pos_session/dispatch-state.json" '.results_latest.A' "PASS" "T3b positional session accepted"
rm -rf "$pos_session"

# T4: no --round flag -> exit 2, no dispatch-state.json mutation
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
assert_exit 2 "$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --result A=PASS
[ ! -f "$FLOW_SESSION/dispatch-state.json" ] || _assert_fail "T4 no dispatch-state.json created"
rm -rf "$FLOW_SESSION"
