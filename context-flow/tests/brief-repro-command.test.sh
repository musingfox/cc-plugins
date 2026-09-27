#!/usr/bin/env bash
# A review repro command sits on the test-case line. A case with no command
# keeps the original line exactly.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
SPECS="$(mktemp -d)"
export SPEC_DIR="$SPECS"

FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {
      "name": "C1",
      "summary": "repro",
      "touches_files": ["x.sh"],
      "test_cases": [
        {"id": "R1", "given": "empty name", "expect": "exit 2", "command": "bash x.sh ''"},
        {"id": "T1", "given": "g", "expect": "e"}
      ]
    }
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
BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/brief.err")

repro="  - R1: given empty name -> expect exit 2 (reproduce: \`bash x.sh ''\`)"
found=$(grep -Fx "$repro" "$BRIEF" || true)
assert_eq "$repro" "$found" "T1 repro line"

plain="  - T1: given g -> expect e"
found_plain=$(grep -Fx "$plain" "$BRIEF" || true)
assert_eq "$plain" "$found_plain" "T2 test case without a command"

# T3: command rendering reverted -> T1 fails.
REV="$(mktemp -d)"
cp -a "$SCRIPTS/." "$REV/"
python3 - "$REV/cf-pi-brief.sh" <<'PY'
import sys
path = sys.argv[1]
lines = open(path).read().splitlines(keepends=True)
out = []
removed = 0
for line in lines:
    if "reproduce:" in line:
        removed += 1
        continue
    out.append(line)
if removed != 1:
    sys.exit("command rendering clause not found (%d)" % removed)
open(path, "w").write("".join(out))
PY
revert_ok=$?
assert_eq "0" "$revert_ok" "T3 revert removed command rendering"
REVERTED=$("$REV/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/reverted.err" || true)
still=yes
if [ -f "$REVERTED" ]; then
  found_rev=$(grep -Fx "$repro" "$REVERTED" || true)
  [ -z "$found_rev" ] && still=no
else
  still=no
fi
assert_eq "no" "$still" "T3 reverted command rendering fails T1"

rm -rf "$FLOW" "$SPECS" "$REV"
