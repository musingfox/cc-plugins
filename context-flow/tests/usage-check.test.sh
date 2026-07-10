#!/usr/bin/env bash
# Tests for cf-pi-usage-check.sh: the pre-dispatch quota gate.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

CHECK="$CF_TESTS_DIR/../scripts/cf-pi-usage-check.sh"
FIX="$(mktemp -d)"

# provider "acme", one account, windows at 90% and 10% -> binding window 90% >= 0.85
cat > "$FIX/hot.json" <<'JSON'
{"reports":[{"provider":"acme","metadata":{"limitReached":false},
 "limits":[{"amount":{"usedFraction":0.90}},{"amount":{"usedFraction":0.10}}]}]}
JSON

# same shape but binding window only 40% -> under ceiling
cat > "$FIX/cool.json" <<'JSON'
{"reports":[{"provider":"acme","metadata":{"limitReached":false},
 "limits":[{"amount":{"usedFraction":0.40}},{"amount":{"usedFraction":0.10}}]}]}
JSON

# two accounts: one maxed (limitReached), one at 20% -> balancing keeps headroom -> OK
cat > "$FIX/balanced.json" <<'JSON'
{"reports":[
 {"provider":"acme","metadata":{"limitReached":true},"limits":[{"amount":{"usedFraction":1.0}}]},
 {"provider":"acme","metadata":{"limitReached":false},"limits":[{"amount":{"usedFraction":0.20}}]}]}
JSON

# T1: no provider set -> skip, dispatch proceeds
out=$(PI_PROVIDER="" CF_USAGE_JSON="$FIX/hot.json" bash "$CHECK")
assert_eq "OK skip-no-provider" "$out" "unset PI_PROVIDER skips the check"

# T2: provider near saturation -> SATURATED
out=$(PI_PROVIDER="acme" CF_USAGE_JSON="$FIX/hot.json" bash "$CHECK")
assert_contains "$out" "SATURATED acme"

# T3: provider with headroom -> OK
out=$(PI_PROVIDER="acme" CF_USAGE_JSON="$FIX/cool.json" bash "$CHECK")
assert_eq "OK" "$out" "under-ceiling provider stays on OMP"

# T4: multi-account balancing keeps a free account -> OK (min-over-accounts)
out=$(PI_PROVIDER="acme" CF_USAGE_JSON="$FIX/balanced.json" bash "$CHECK")
assert_eq "OK" "$out" "one maxed account does not block when another is free"

# T5: provider not present in report -> fail-open OK
out=$(PI_PROVIDER="ghost" CF_USAGE_JSON="$FIX/hot.json" bash "$CHECK")
assert_eq "OK skip-unmatched" "$out" "unmatched provider fails open"

# T6: empty/garbage json -> fail-open OK
out=$(PI_PROVIDER="acme" CF_USAGE_JSON="/dev/null" bash "$CHECK")
assert_eq "OK skip-nodata" "$out" "empty usage json fails open"

# T7: custom ceiling makes the 40% provider trip
out=$(PI_PROVIDER="acme" PI_USAGE_CEILING="0.30" CF_USAGE_JSON="$FIX/cool.json" bash "$CHECK")
assert_contains "$out" "SATURATED acme"

rm -rf "$FIX"
