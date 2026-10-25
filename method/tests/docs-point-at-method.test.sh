#!/usr/bin/env bash
# The root README's method section and three spec entries name the paths method
# now carries, not the plugins they left.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"

TOP="$(cd "$METHOD_TESTS_DIR/../.." && pwd)"
README="$TOP/README.md"
SPECS="$TOP/docs/spec"

# The method section of the root README, from its heading to the next ### heading.
sec="$(awk '/^### Method/ {on=1; next} on && /^### / {exit} on' "$README")"
assert_contains "$sec" '`method:review`' "root README: method section names its review seat"
for k in 'method:probe' 'method:prototype' 'method:divergence' 'scope-gate.sh' 'revert-gate.sh' 'render-decision.sh'; do
  assert_contains "$sec" "$k" "root README: method section names $k"
done
uses="$(printf '%s\n' "$sec" | grep -F -- '**Uses**' || true)"
assert_eq "" "$(printf '%s\n' "$uses" | grep -E 'context''-flow|cf''[:-]|spiral' || true)" "root README: Uses names no other plugin's agents or scripts"
assert_eq "" "$(printf '%s\n' "$sec" | grep -E 'cf''[:-]|spiral''.s' || true)" "root README: method section has no cf seat or spiral's agents"

# The three spec entries: scope and verify name the moved paths.
front() { awk '/^---$/ {n++; next} n==1' "$SPECS/$1.md"; }
for id in cross-plugin-runtime-resolution dispatch-verdict-from-file judge-seats-cannot-edit; do
  fm="$(front "$id")"
  assert_eq "" "$(printf '%s\n' "$fm" | grep -E 'context''-flow|spiral''/' || true)" "spec $id: scope and verify name no retired path"
done
assert_contains "$(front cross-plugin-runtime-resolution)" '"method/scripts/**"' "spec cross-plugin-runtime-resolution: scope is method/scripts"
assert_contains "$(front dispatch-verdict-from-file)" '"method/scripts/**"' "spec dispatch-verdict-from-file: scope is method/scripts"
judge="$(front judge-seats-cannot-edit)"
assert_contains "$judge" '"method/agents/review.md"' "spec judge-seats-cannot-edit: scope names method/agents/review.md"
assert_contains "$judge" 'pi-dispatch/agents/reviewer.md method/agents/review.md' "spec judge-seats-cannot-edit: verify reads method/agents/review.md"

# The verify holds because it reads the file, not because the file is missing.
assert_exit 0 test -f "$TOP/method/agents/review.md"
assert_exit 0 bash -c "cd '$TOP' && grep -h '^tools:' pi-dispatch/agents/reviewer.md method/agents/review.md | grep -c '^tools:' | grep -qx 2"
