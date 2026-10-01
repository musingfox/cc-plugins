#!/usr/bin/env bash
# Pins cf.md's Claude round (§3.2): READY shards are prepared, built by parallel
# background cf:implement agents and judged by --gates-only, never by hand.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

s31=$(awk '/^### 3\.1/ {p=1; next} p && /^### / {exit} p' "$CFMD")
s32=$(awk '/^### 3\.2/ {p=1; next} p && /^### / {exit} p' "$CFMD")
s33=$(awk '/^### 3\.3/ {p=1; next} p && /^### / {exit} p' "$CFMD")

first_line() {
  printf '%s\n' "$s32" | grep -n -m1 -F -- "$1" | cut -d: -f1
}
count() { printf '%s\n' "$1" | grep -cF -- "$2" || true; }

# T1
assert_contains "$s31" 'SHARD_TEST_RUNNER=%s' "§3.1 records SHARD_TEST_RUNNER"
assert_contains "$s31" '--gates-only' "§3.1 says the recorded runner feeds --gates-only"

# T2
for token in '--prepare-only' 'subagent_type: "cf:implement"' '--gates-only' 'run_in_background: true' \
             'timeout: 7200000' 'REBRIEF' 'host-snapshot' 'claude-dispatch.log' 'Report path:' 'host repo root'; do
  assert_contains "$s32" "$token" "§3.2 names $token"
done

# T3
prep_ln=$(first_line '--prepare-only')
agent_ln=$(first_line 'subagent_type: "cf:implement"')
gates_ln=$(first_line '--gates-only')
if [ -n "$prep_ln" ] && [ -n "$agent_ln" ] && [ -n "$gates_ln" ] && [ "$prep_ln" -lt "$agent_ln" ] && [ "$agent_ln" -lt "$gates_ln" ]; then
  assert_eq "order" "order" "§3.2 orders prepare, dispatch, gates"
else
  assert_eq "prep<agent<gates" "$prep_ln,$agent_ln,$gates_ln" "§3.2 orders prepare, dispatch, gates"
fi

# T4
agent_call=$(printf '%s\n' "$s32" | awk '/subagent_type: "cf:implement"/ {p=1} p {print} p && /^ *\)$/ {exit}')
assert_contains "$agent_call" 'Report path:' "the agent call was extracted"
assert_eq "0" "$(count "$agent_call" 'name:')" "the cf:implement call carries no name:"

# T5
assert_eq "0" "$(count "$s32" 'cf-pi-scope.sh')" "§3.2 runs no scope gate by hand"
assert_eq "0" "$(count "$s32" 'cf-pi-revert-gate.sh')" "§3.2 runs no revert gate by hand"

# T6
assert_contains "$s32" '20' "§3.2 names the 20-agent batch size"
assert_contains "$s32" 'Concurrent subagent limit reached' "§3.2 names the concurrency error"

# T7
assert_contains "$s33" 'no Monitor' "§3.3 says Claude rounds arm no Monitor"

# T8
assert_contains "$s32" 'outcome-missing' "§3.2 maps a missing outcome to FAIL"
assert_contains "$s32" 'usage limit' "§3.2 sends a usage-limit reply to §3.6"
assert_contains "$s32" 'tell the human' "§3.2 reports a snapshot mismatch"

# T9
assert_contains "$s32" '§3.3' "§3.2 continues at §3.3"

# T10
assert_contains "$s32" 'the gates decide' "§3.2 leaves the verdict to the gates"
