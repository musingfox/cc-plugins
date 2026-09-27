#!/usr/bin/env bash
# Pins the protocol's Brief anatomy: each contract reaches the worker with its
# full interface and the plan steps that fulfil it.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"

anatomy=$(awk '/^### Brief anatomy/ {p=1; next} p && /^#/ {exit} p' "$PROTOCOL")
methodology=$(sed -n '/<!-- METHODOLOGY-BEGIN -->/,/<!-- METHODOLOGY-END -->/p' "$PROTOCOL")

# T1
for field in input output errors implementation_plan; do
  assert_contains "$anatomy" "$field" "Brief anatomy names $field"
done

# T2
assert_eq "0" "$(grep -cF 'do not reach the worker' "$PROTOCOL" || true)" \
  "protocol no longer says plan fields do not reach the worker"

# T3
assert_contains "$methodology" "the Implementation Plan is only guidance" \
  "METHODOLOGY still calls the Implementation Plan guidance"
