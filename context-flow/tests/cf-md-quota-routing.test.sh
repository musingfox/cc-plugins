#!/usr/bin/env bash
# Pins cf.md's quota routing: no pre-dispatch gate, quota reasons are never
# re-launched, and a quota outcome is a §3.6 fallback trigger.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_MD="$CF_TESTS_DIR/../commands/cf.md"

assert_eq "0" "$(grep -c 'quota-saturated' "$CF_MD")" "cf.md no longer names quota-saturated"
assert_eq "0" "$(grep -c 'pre-dispatch quota gate reports' "$CF_MD")" "cf.md no longer names the pre-dispatch quota gate"

any_fail="$(awk '/^#### Any FAIL/ { on = 1; next } on && /^####/ { exit } on' "$CF_MD")"
assert_contains "$any_fail" "QUOTA-WINDOW" "Any FAIL names QUOTA-WINDOW"
assert_contains "$any_fail" "QUOTA" "Any FAIL names QUOTA"
assert_contains "$any_fail" "re-launch" "Any FAIL speaks of the re-launch"

exempt="$(printf '%s\n' "$any_fail" | grep -m1 'exempt from the re-launch')"
for reason in test-stalled probe-stalled QUOTA QUOTA-WINDOW; do
  assert_contains "$exempt" "\`$reason\`" "the exemption sentence lists $reason"
done
assert_eq "0" "$(grep -c 'Two reasons' "$CF_MD")" "the exemption list carries no count"

assert_contains "$(grep -m1 '^### 3\.6' "$CF_MD")" "QUOTA" "§3.6 heading names the quota tags"
