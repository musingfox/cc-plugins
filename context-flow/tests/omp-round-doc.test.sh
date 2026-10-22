#!/usr/bin/env bash
# Pins cf.md's OMP round (§3.6): one background Bash runs cf-pi-run.sh for every
# READY shard and waits for them, with no progress Monitor, under a two-hour limit.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"
P3MD="$CF_TESTS_DIR/../docs/phase-3-implement.md"
POSTMD="$CF_TESTS_DIR/../docs/post-pass-protocol.md"

s32=$(awk '/^### 3\.2/ {p=1; next} p && /^### / {exit} p' "$P3MD")
s33=$(awk '/^### 3\.3/ {p=1; next} p && /^### / {exit} p' "$P3MD")
s36=$(awk '/^### 3\.6/ {p=1; print; next} p && /^## / {exit} p' "$P3MD")
phase3_intro=$(awk '/^# Phase 3/ {p=1; next} /^### 3\.0/ {exit} p' "$P3MD")
token_line=$(grep -F '**Token discipline' "$P3MD")
omp_fenced=$(printf '%s\n' "$s36" | awk '/^```/ {f=!f; next} f')

count() { printf '%s\n' "$1" | grep -cF -- "$2" || true; }

# T1
heading=$(grep -m1 '^### 3\.6' "$P3MD")
assert_contains "$heading" "OMP" "§3.6 heading names OMP"
assert_contains "$heading" "QUOTA" "§3.6 heading names QUOTA"

# T2
for token in 'cf-pi-run.sh $SESSION/shards/A' 'run_in_background: true' 'timeout: 7200000' \
             'No pre-dispatch quota gate' 'cf-pi-status.sh'; do
  assert_contains "$s36" "$token" "§3.6 holds $token"
done

# T3
assert_eq "0" "$(count "$s36" 'cf-pi-revert-gate.sh')" "§3.6 no longer runs the revert gate by hand"
assert_eq "0" "$(count "$s36" 'Claude fallback')" "§3.6 no longer names a Claude fallback"

# T4
assert_eq "0" "$(count "$s32" 'cf-pi-run.sh $SESSION/shards/')" "§3.2 holds no plain cf-pi-run.sh launch"
assert_eq "0" "$(count "$s33" 'Monitor(')" "§3.3 arms no Monitor"

# T5
assert_eq "0" "$(cat "$CFMD" "$P3MD" "$POSTMD" | grep -cF 'exempt from the 10-minute Bash ceiling' || true)" "no claim that background tasks escape the 10-minute ceiling"

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

# OmpNoProgressMonitor T1
assert_eq "0" "$(cat "$CFMD" "$P3MD" "$POSTMD" | grep -cF 'Monitor(' || true)" "cf.md has no Monitor( call"
assert_eq "0" "$(cat "$CFMD" "$P3MD" "$POSTMD" | grep -cF 'cf-pi-watch' || true)" "cf.md names no cf-pi-watch"
allowed_tools=$(grep -m1 '^allowed-tools:' "$CFMD")
assert_eq "0" "$(count "$allowed_tools" 'Monitor')" "front-matter allowed-tools has no Monitor"

# OmpNoProgressMonitor T2
assert_contains "$s36" 'Watch progress: bash $SCRIPTS/cf-pi-status.sh $SESSION' "§3.6 prints the status line"
assert_eq "0" "$(count "$s36" 'all shards done')" "§3.6 names no all-shards-done signal"

# OmpNoProgressMonitor T3
assert_eq "0" "$(cat "$CFMD" "$P3MD" "$POSTMD" "$CF_TESTS_DIR/../docs/parallel-sharded-design.md" | grep -cE 'band.*progress|progress.*band' || true)" \
  "no band-hook progress claim in cf.md or the design doc"

# OmpNoProgressMonitor T4
assert_eq "0" "$(ls "$CF_TESTS_DIR/../scripts/cf-pi-watch.sh" "$CF_TESTS_DIR/watch.test.sh" 2>/dev/null | wc -l | tr -d ' ')" \
  "cf-pi-watch.sh and watch.test.sh are deleted"
assert_eq "" "$(grep -rlF cf-pi-watch "$CF_TESTS_DIR/../scripts" "$CF_TESTS_DIR/../commands" "$CF_TESTS_DIR/../hooks" 2>/dev/null)" \
  "no scripts, commands or hooks name cf-pi-watch"
assert_eq "0" "$(grep -cF 'cf-pi-watch' "$CF_TESTS_DIR/rerun-clears-artifacts.test.sh" || true)" "rerun-clears-artifacts names no cf-pi-watch"
assert_eq "0" "$(grep -cF 'one-hour Monitor' "$CF_TESTS_DIR/../scripts/cf-pi-test.sh" || true)" "cf-pi-test.sh names no one-hour Monitor"
assert_eq "0" "$(grep -cF 'one-hour Monitor' "$CF_TESTS_DIR/test-gate-bounds.test.sh" || true)" "test-gate-bounds names no one-hour Monitor"

# OmpNoProgressMonitor T5
assert_contains "$s33" 'no Monitor' "§3.3 says Claude rounds arm no Monitor"
