#!/usr/bin/env bash
# The worker brief shows each contract's input, output, errors, and plan steps
# inside its ### block. Absent fields render nothing — no label, no null.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
SPECS="$(mktemp -d)"
export SPEC_DIR="$SPECS"

assemble() {
  FLOW="$(mktemp -d)"
  cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {
      "name": "C1",
      "summary": "gate",
      "input": "SHARD_SESSION path",
      "output": "CLEAN <n>",
      "errors": "ERROR usage",
      "touches_files": ["scripts/gate.sh"],
      "implementation_plan": [
        {"title": "Step 2: Add the gate", "target": "scripts/gate.sh", "approach": "revert in place", "order": "after Step 1"}
      ]
    },
    {
      "name": "C2",
      "summary": "shares the gate file",
      "touches_files": ["scripts/gate.sh"]
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
  [ ! -f "$FLOW/plan.md" ]
  "$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
  SID=$(jq -r '.groups | keys[0]' "$FLOW/shards.json")
  SHARD_SESSION="$FLOW/shards/$SID"
  BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/brief.err")
  BRIEF_RC=$?
}

assemble

# T1
body=$(cat "$BRIEF")
assert_contains "$body" "- **input**: SHARD_SESSION path" "T1 input line"
assert_contains "$body" "- **output**: CLEAN <n>" "T1 output line"
assert_contains "$body" "- **errors**: ERROR usage" "T1 errors line"
assert_contains "$body" "  - Step 2: Add the gate — target \`scripts/gate.sh\`; approach: revert in place; order: after Step 1" "T1 plan step"

# T2: C1 and C2 share a file, so those lines sit between the two headings.
between=$(awk '/^### C1$/{f=1; next} /^### C2$/{f=0} f' "$BRIEF")
assert_contains "$between" "- **input**: SHARD_SESSION path" "T2 input is between C1 and C2"
assert_contains "$between" "- **output**: CLEAN <n>" "T2 output is between C1 and C2"
assert_contains "$between" "- **errors**: ERROR usage" "T2 errors is between C1 and C2"
assert_contains "$between" "  - Step 2: Add the gate — target \`scripts/gate.sh\`; approach: revert in place; order: after Step 1" "T2 step is between C1 and C2"

# T3: C2 has none of the new fields.
c2=$(awk '/^### C2$/{f=1; next} f && /^### /{exit} f' "$BRIEF")
input_in_c2=$(printf '%s\n' "$c2" | grep -c '\*\*input\*\*' || true)
assert_eq "0" "$input_in_c2" "T3 C2 block has no input label"
nulls=$(grep -c 'null' "$BRIEF" || true)
assert_eq "0" "$nulls" "T3 brief contains no null"

# T4
assert_eq "0" "$BRIEF_RC" "T4 cf-pi-brief.sh exits 0"
headers=$(grep -c '^## ' "$BRIEF" || true)
enough=no
[ "$headers" -ge 7 ] && enough=yes
assert_eq "yes" "$enough" "T4 brief has at least 7 ## headings (got $headers)"

# T5: render_contracts without the interface fields fails T1.
REV="$(mktemp -d)"
cp -a "$SCRIPTS/." "$REV/"
python3 - "$REV/cf-pi-brief.sh" <<'PY'
import sys
path = sys.argv[1]
lines = open(path).read().splitlines(keepends=True)
out = []
skip = False
removed = 0
for line in lines:
    if skip:
        removed += 1
        if 'else "" end) +' in line:
            skip = False
        continue
    if "if .input then" in line or "if .output then" in line or "if .errors then" in line:
        removed += 1
        continue
    if "implementation_plan" in line:
        skip = True
        removed += 1
        continue
    out.append(line)
if removed < 4:
    sys.exit("render_contracts interface clauses not found")
open(path, "w").write("".join(out))
PY
revert_ok=$?
assert_eq "0" "$revert_ok" "T5 revert of render_contracts edited the script"
REVERTED=$("$REV/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/reverted.err" || true)
still=yes
case "$REVERTED" in
  *"- **input**: SHARD_SESSION path"*) ;;
  *) still=no ;;
esac
# The path is printed on stdout; the body is the file it names when the run succeeds.
if [ -f "$REVERTED" ]; then
  case "$(cat "$REVERTED")" in
    *"- **input**: SHARD_SESSION path"*) still=yes ;;
    *) still=no ;;
  esac
fi
assert_eq "no" "$still" "T5 reverted render_contracts fails T1"

rm -rf "$FLOW" "$SPECS" "$REV"
