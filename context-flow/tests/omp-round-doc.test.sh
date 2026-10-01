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
