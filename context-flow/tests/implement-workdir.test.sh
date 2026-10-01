#!/usr/bin/env bash
# A cf:implement builder starts in the orchestrator's directory; its brief, its
# agent definition and protocol §5 all tell it to cd into WORK_DIR first.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
IMPLEMENT="$CF_TESTS_DIR/../agents/implement.md"
FLOW="$(mktemp -d)"
SPECS="$(mktemp -d)"
export SPEC_DIR="$SPECS"
trap 'rc=$?; rm -rf "$FLOW" "$SPECS"; (exit "$rc"); _assert_summary_on_exit' EXIT

assert_contains "$(cat "$IMPLEMENT")" 'cd "<WORK_DIR>" &&' "T1 implement.md requires cd into WORK_DIR"
assert_eq "0" "$(grep -cE '\$WORK([^_]|$)' "$IMPLEMENT" || true)" "T1b implement.md no longer mentions \$WORK"
assert_eq "0" "$(grep -c 'implement-outcome.md' "$IMPLEMENT" || true)" "T1c implement.md no longer mentions implement-outcome.md"

cat > "$FLOW/contracts.json" <<'JSON'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {"name": "OnlyContract", "touches_files": ["src/lib.py"],
     "behavior": "b", "test_cases": [{"input": "i", "expected": "e"}]}
  ]
}
JSON
FLOW_BASE="$(basename "$FLOW")"
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="$FLOW_BASE"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
PI_PROTOCOL="$PROTOCOL"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_DISPATCH_CMD=""
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
EOF
touch "$FLOW/cleanup.sh"

"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
SID=$(jq -r '.groups | keys[0]' "$FLOW/shards.json")
BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$FLOW/shards/$SID" "goal" "constraints" "true")
assert_eq "0" "$?" "T2 brief assembles"

work_line=$(grep -m1 -F '**WORK_DIR**' "$BRIEF")
assert_contains "$work_line" "cd" "T2b WORK_DIR line tells the builder to cd"
case "$work_line" in
  *"already on the cf branch here"*) assert_eq "absent" "present" "T2c old 'already on the cf branch here' wording gone" ;;
  *) assert_eq "ok" "ok" "T2c old 'already on the cf branch here' wording gone" ;;
esac

section5=$(awk '/^## 5\./{f=1; print; next} f && /^## /{exit} f' "$PROTOCOL")
assert_contains "$section5" "cf:implement" "T3 protocol §5 names the cf:implement builder"
assert_contains "$section5" "except \`REPORT_FILE\` and \`ESCALATE_FILE\`" "T3b protocol §5 keeps the two exceptions"

for t in brief-writable-rule brief-anatomy-doc brief-interface-fields; do
  if bash "$CF_TESTS_DIR/$t.test.sh" >/dev/null 2>&1; then
    assert_eq "ok" "ok" "T4 $t passes"
  else
    assert_eq "ok" "fail" "T4 $t passes"
  fi
done
