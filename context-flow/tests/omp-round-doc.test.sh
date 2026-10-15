#!/usr/bin/env bash
# Pins cf.md's OMP round (§3.6): one background cf-pi-run.sh per READY shard plus
# a progress Monitor, moved out of §3.2 and §3.3, under a two-hour limit.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

s32=$(awk '/^### 3\.2/ {p=1; next} p && /^### / {exit} p' "$CFMD")
s33=$(awk '/^### 3\.3/ {p=1; next} p && /^### / {exit} p' "$CFMD")
s36=$(awk '/^### 3\.6/ {p=1; print; next} p && /^## / {exit} p' "$CFMD")
phase3_intro=$(awk '/^## Phase 3/ {p=1; next} /^### 3\.0/ {exit} p' "$CFMD")
token_line=$(grep -F '**Token discipline' "$CFMD")
omp_fenced=$(printf '%s\n' "$s36" | awk '/^```/ {f=!f; next} f')

count() { printf '%s\n' "$1" | grep -cF -- "$2" || true; }

# T1
heading=$(grep -m1 '^### 3\.6' "$CFMD")
assert_contains "$heading" "OMP" "§3.6 heading names OMP"
assert_contains "$heading" "QUOTA" "§3.6 heading names QUOTA"

# T2
for token in 'cf-pi-run.sh $SESSION/shards/A' 'run_in_background: true' 'timeout: 7200000' \
             'cf-pi-watch.sh' 'Monitor(' 'No pre-dispatch quota gate' 'cf-pi-status.sh'; do
  assert_contains "$s36" "$token" "§3.6 holds $token"
done

# T3
assert_eq "0" "$(count "$s36" 'cf-pi-revert-gate.sh')" "§3.6 no longer runs the revert gate by hand"
assert_eq "0" "$(count "$s36" 'Claude fallback')" "§3.6 no longer names a Claude fallback"

# T4
assert_eq "0" "$(count "$s32" 'cf-pi-run.sh $SESSION/shards/')" "§3.2 holds no plain cf-pi-run.sh launch"
assert_eq "0" "$(count "$s33" 'Monitor(')" "§3.3 arms no Monitor"

# T5
assert_eq "0" "$(grep -cF 'exempt from the 10-minute Bash ceiling' "$CFMD" || true)" "no claim that background tasks escape the 10-minute ceiling"

# T6
if [ -e "$CF_TESTS_DIR/fallback-revert-gate-doc.test.sh" ]; then
  assert_eq "absent" "present" "fallback-revert-gate-doc.test.sh is deleted"
else
  assert_eq "absent" "absent" "fallback-revert-gate-doc.test.sh is deleted"
fi
if bash "$CF_TESTS_DIR/cf-md-quota-routing.test.sh" >/dev/null; then
  assert_eq "ok" "ok" "cf-md-quota-routing.test.sh still ok"
else
  assert_eq "ok" "fail" "cf-md-quota-routing.test.sh still ok"
fi

# OmpWaveLaunch T1
for token in 'cf-pi-run.sh $SESSION/shards/A' 'cf-pi-run.sh $SESSION/shards/B' 'run_in_background: true' \
             'timeout: 7200000' '. $SESSION/env.sh || exit 1' 'wait' 'exit 0' '/run.out'; do
  assert_contains "$s36" "$token" "§3.6 launch holds $token"
done

# OmpWaveLaunch T2
assert_eq "1" "$(printf '%s\n' "$s36" | grep -c '^Bash(' || true)" "§3.6 has one Bash( line"
assert_eq "1" "$(count "$omp_fenced" 'run_in_background: true')" "§3.6 example carries one run_in_background"

# OmpWaveLaunch T11
assert_contains "$heading" "one background Bash" "§3.6 heading says one background Bash per wave"
assert_eq "0" "$(count "$heading" 'per shard')" "§3.6 heading no longer says per shard"

# OmpWaveLaunch T12
cf_pi_run_head=$(head -n 15 "$CF_TESTS_DIR/../scripts/cf-pi-run.sh")
assert_contains "$cf_pi_run_head" 'run.out' "cf-pi-run.sh header names the shard's run.out"
assert_eq "0" "$(count "$cf_pi_run_head" 'Main launches this as a background task')" "cf-pi-run.sh header drops the background-task claim"
assert_eq "0" "$(count "$cf_pi_run_head" 'exempt from the foreground Bash ceiling')" "cf-pi-run.sh header drops the foreground-ceiling claim"

# OmpWaveLaunch T5
assert_contains "$phase3_intro" 'one background Bash' "Phase 3 intro names one background Bash"
assert_eq "0" "$(count "$phase3_intro" 'one background `cf-pi-run.sh`')" "Phase 3 intro no longer names one background cf-pi-run.sh"
assert_contains "$token_line" 'run.out' "Token discipline names run.out"
