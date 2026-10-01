#!/usr/bin/env bash
# agents/implement.md defers the report to the brief, so a Claude builder's report
# lands in the schema gate 1 checks instead of a schema of its own.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

IMPLEMENT="$CF_TESTS_DIR/../agents/implement.md"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"

assert_eq "0" "$(grep -c '^## Completed' "$IMPLEMENT" || true)" "T1 implement.md defines no ## Completed heading"
assert_eq "0" "$(grep -c 'Failure Class' "$IMPLEMENT" || true)" "T1b implement.md defines no Failure Class"

body=$(cat "$IMPLEMENT")
assert_contains "$body" "Output Requirements" "T2 implement.md defers to the brief's Output Requirements"
assert_contains "$body" "Report written:" "T2b implement.md keeps the Report written: return line"

# T3: the brief's SCHEMA fence, written as a report, passes gate 1's predicate.
report="$(mktemp)"
sed -n '/<!-- SCHEMA-BEGIN -->/,/<!-- SCHEMA-END -->/p' "$PROTOCOL" \
  | awk '/^```markdown/{f=1; next} /^```$/{f=0} f' > "$report"
if head -20 "$report" | grep -q '^## Summary' && head -20 "$report" | grep -q '^## Completed'; then
  assert_eq "pass" "pass" "T3 schema fence body passes the report gate"
else
  assert_eq "pass" "fail" "T3 schema fence body passes the report gate"
fi
rm -f "$report"

fm=$(sed -n '1,/^---$/p;' "$IMPLEMENT" | sed -n '1,9p')
assert_contains "$fm" "model: sonnet" "T4 model unchanged"
assert_contains "$fm" "effort: medium" "T4b effort unchanged"
assert_contains "$fm" "tools: Read, Edit, Write, Bash, Glob, Grep, WebFetch" "T4c tools unchanged"
assert_eq "0" "$(grep -c 'permissionMode' "$IMPLEMENT" || true)" "T4d no permissionMode"

# T5: the recurring-failure-classes guard still passes.
if bash "$CF_TESTS_DIR/recurring-failure-classes.test.sh" >/dev/null 2>&1; then
  assert_eq "ok" "ok" "T5 recurring-failure-classes.test.sh passes"
else
  assert_eq "ok" "fail" "T5 recurring-failure-classes.test.sh passes"
fi
