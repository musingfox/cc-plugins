#!/usr/bin/env bash
# The worker's write rule names REPORT_FILE and ESCALATE_FILE as the only
# writes allowed outside WORK_DIR, in both the assembled brief and protocol §5.
# Without the exception a worker obeying the rule never writes its report.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
FLOW="$(mktemp -d)"
SPECS="$(mktemp -d)"
export SPEC_DIR="$SPECS"

cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {"name": "OnlyContract", "touches_files": ["src/lib.py"],
     "behavior": "b", "test_cases": [{"input": "i", "expected": "e"}]}
  ]
}
EOF

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
SHARD_SESSION="$FLOW/shards/$SID"

BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "true")
assert_eq "0" "$?" "T0 brief assembles"

# T1: the first bullet under ## Rules carries the exception and denies the rest.
first_rule=$(awk '/^## Rules$/{f=1; next} f && /^- /{print; exit}' "$BRIEF")
assert_contains "$first_rule" "except REPORT_FILE and ESCALATE_FILE" "T1 brief rule names the two exceptions"
assert_contains "$first_rule" "WORK_DIR" "T1b brief rule still anchors writes to WORK_DIR"
assert_contains "$first_rule" "every other path" "T1c brief rule denies every other path"

# T2: protocol §5 states the same exception; the unqualified rule is gone.
section5=$(awk '/^## 5\./{f=1; print; next} f && /^## /{exit} f' "$PROTOCOL")
assert_contains "$section5" "except \`REPORT_FILE\` and \`ESCALATE_FILE\`" "T2 protocol §5 names the two exceptions"
assert_eq "0" "$(grep -c 'Write only inside `WORK_DIR`;' "$PROTOCOL" || true)" "T2b unqualified protocol rule removed"

rm -rf "$FLOW" "$SPECS"
