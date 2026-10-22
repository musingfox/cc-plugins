#!/usr/bin/env bash
# Pins cf.md's quota routing: no pre-dispatch gate, quota reasons are never
# re-launched on the same routing, and a quota outcome on OMP is offered a route
# back to the Claude builder (CF_IMPLEMENTER=claude) or a stop.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_MD="$CF_TESTS_DIR/../commands/cf.md"
P3MD="$CF_TESTS_DIR/../docs/phase-3-implement.md"

assert_eq "0" "$(cat "$CF_MD" "$P3MD" | grep -c 'quota-saturated')" "cf.md and phase-3-implement.md no longer names quota-saturated"
assert_eq "0" "$(cat "$CF_MD" "$P3MD" | grep -c 'pre-dispatch quota gate reports')" "cf.md and phase-3-implement.md no longer names the pre-dispatch quota gate"

any_fail="$(awk '/^#### Any FAIL/ { on = 1; next } on && /^####/ { exit } on' "$P3MD")"
assert_contains "$any_fail" "QUOTA-WINDOW" "Any FAIL names QUOTA-WINDOW"
assert_contains "$any_fail" "QUOTA" "Any FAIL names QUOTA"
assert_contains "$any_fail" "re-launch" "Any FAIL speaks of the re-launch"

exempt="$(printf '%s\n' "$any_fail" | grep -m1 'exempt from the re-launch')"
for reason in test-stalled probe-stalled QUOTA QUOTA-WINDOW; do
  assert_contains "$exempt" "\`$reason\`" "the exemption sentence lists $reason"
done
assert_eq "0" "$(cat "$CF_MD" "$P3MD" | grep -c 'Two reasons')" "the exemption list carries no count"

assert_contains "$any_fail" "When any shard in the round ended \`QUOTA\` or \`QUOTA-WINDOW\`, do not re-launch that round's other FAIL shards on the same \`\$PI_DISPATCH_CMD\`" \
  "a quota outcome holds the round's other FAIL re-launches"

assert_contains "$(grep -m1 '^### 3\.6' "$P3MD")" "QUOTA" "§3.6 heading names the quota tags"

assert_contains "$any_fail" 'CF_IMPLEMENTER=claude' "a quota outcome can route back to the Claude builder"
assert_eq "0" "$(printf '%s\n' "$any_fail" | grep -cF 'Claude fallback' || true)" "Any FAIL names no Claude fallback"
