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
for token in '--prepare-only' 'subagent_type: "cf:implement"' '--gates-only' \
             'REBRIEF' 'host-snapshot' 'claude-dispatch.log' 'Report path:' 'host repo root'; do
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

# CollectOnSingleCompletion T1
for token in 'no Monitor' 'one background completion' 'do not end the turn again' 'each agent return'; do
  assert_contains "$s33" "$token" "§3.3 names $token"
done

# CollectOnSingleCompletion T2
assert_eq "0" "$(count "$s33" "each shard's background \`--gates-only\`")" "§3.3 no longer ties re-invocation to each shard's background --gates-only"
assert_eq "0" "$(count "$s33" 'progress Monitor belongs')" "§3.3 no longer places the progress Monitor in the OMP round"

# GatesOnlyForeground T1
s32_step4=$(printf '%s\n' "$s32" | awk '/^4\. / {p=1} /^5\. / {exit} p')
first_ex=$(printf '%s\n' "$s32_step4" | awk '/^ *```/ {c++; next} c==1')
assert_contains "$first_ex" 'timeout: 600000' "step 4 foreground example carries timeout: 600000"
assert_contains "$first_ex" '--gates-only' "step 4 foreground example runs --gates-only"
assert_contains "$first_ex" '> $SESSION/shards/A/gates.out 2>&1' "step 4 foreground example redirects to gates.out"
assert_contains "$first_ex" 'claude-dispatch.log' "step 4 foreground example logs the return"
assert_eq "0" "$(count "$first_ex" 'run_in_background')" "step 4 foreground example runs in the foreground"
assert_eq "0" "$(count "$s32_step4" 'run_in_background')" "step 4 holds no run_in_background, so no background form"
fg_timeout_ln=$(printf '%s\n' "$s32_step4" | grep -n -m1 -F 'timeout: 600000' | cut -d: -f1)

# GatesOnlyForeground T2
assert_contains "$s32_step4" 'not the exit code' "step 4 routes on outcome.md and gates.out, not the exit code"

# GatesBackgroundRule T1
for token in 'gate-seconds' 'run_in_background' '7200000' 'awk' '480'; do
  assert_eq "0" "$(count "$s32_step4" "$token")" "step 4 holds no $token"
done

# GatesBackgroundRule T2
assert_contains "$s32_step4" '--gates-only' "step 4 slice still names --gates-only"
assert_contains "$s32_step4" 'timeout: 600000' "step 4 slice still carries timeout: 600000"

# ForegroundCapRecovery T1
for token in 'was moved to the background' 'keeps running' 'do not re-run' 'completion notification' \
             'not counted against the retry budget'; do
  assert_contains "$s32_step4" "$token" "step 4 names $token"
done

# ForegroundCapRecovery T2
for token in 'not the verdict' 'Re-run that shard' 'background re-run' 'background form'; do
  assert_eq "0" "$(count "$s32_step4" "$token")" "step 4 holds no $token"
done

# ForegroundCapRecovery T3: the moved-to-background line follows the timeout line it refers to
moved_ln=$(printf '%s\n' "$s32_step4" | grep -n -m1 -F 'was moved to the background' | cut -d: -f1)
if [ -n "$moved_ln" ] && [ -n "$fg_timeout_ln" ] && [ "$moved_ln" -gt "$fg_timeout_ln" ]; then
  assert_eq "order" "order" "step 4 moved-to-background line follows the timeout line"
else
  assert_eq "timeout<moved" "$fg_timeout_ln,$moved_ln" "step 4 moved-to-background line follows the timeout line"
fi
