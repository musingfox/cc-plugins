#!/usr/bin/env bash
# A shard that already passed, and that another shard merged, is told to land
# fixes as new commits. The rule is absent unless both conditions hold.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
SPECS="$(mktemp -d)"
export SPEC_DIR="$SPECS"

flow_env() {
  local flow="$1"
  local base
  base="$(basename "$flow")"
  cat > "$flow/env.sh" <<EOF
SESSION="$flow"
SESSION_BASENAME="$base"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
PI_PROTOCOL="$PROTOCOL"
CLEANUP_SCRIPT="$flow/cleanup.sh"
PI_DISPATCH_CMD=""
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
EOF
  touch "$flow/cleanup.sh"
}

phrase_hits() {
  grep -c 'already passed as' "$1" || true
}

# T1: checkpoint for A, and group B depends on A.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "f",
  "contracts": [
    {"name": "P", "summary": "p", "touches_files": ["a.sh"]},
    {"name": "Q", "summary": "q", "touches_files": ["b.sh"], "depends": ["P"]}
  ]
}
EOF
flow_env "$FLOW"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
dep=$(jq -r '.groups.B.depends_on[]?' "$FLOW/shards.json")
assert_eq "A" "$dep" "T1 fixture: group B depends on A"
cat > "$FLOW/dispatch-state.json" <<'EOF'
{"checkpoints": {"A": "cf-checkpoint/f/shard-A@abc"}}
EOF
SHARD_SESSION="$FLOW/shards/A"
BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/brief.err")
rules=$(awk '/^## Rules$/{f=1; next} f && /^## /{exit} f' "$BRIEF")
assert_contains "$rules" "cf-checkpoint/f/shard-A@abc" "T1 rules name the checkpoint tag"
assert_contains "$rules" "new commit" "T1 rules require a new commit"
assert_contains "$rules" "B" "T1 rules name the dependent shard"

# T5: rule rendering removed -> T1 fails.
REV="$(mktemp -d)"
cp -a "$SCRIPTS/." "$REV/"
python3 - "$REV/cf-pi-brief.sh" <<'PY'
import sys
path = sys.argv[1]
lines = open(path).read().splitlines(keepends=True)
out = []
removed = 0
for line in lines:
    if line.strip() == "render_checkpoint_rule":
        removed += 1
        continue
    out.append(line)
if removed != 1:
    sys.exit("rule rendering call not found (%d)" % removed)
open(path, "w").write("".join(out))
PY
revert_ok=$?
assert_eq "0" "$revert_ok" "T5 revert removed rule rendering"
REVERTED=$("$REV/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/reverted.err" || true)
still=yes
if [ -f "$REVERTED" ]; then
  rev_rules=$(awk '/^## Rules$/{f=1; next} f && /^## /{exit} f' "$REVERTED")
  case "$rev_rules" in
    *"cf-checkpoint/f/shard-A@abc"*) ;;
    *) still=no ;;
  esac
else
  still=no
fi
assert_eq "no" "$still" "T5 removed rule rendering fails T1"
rm -rf "$FLOW" "$REV"

# T2: no checkpoint for A.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "f",
  "contracts": [
    {"name": "P", "summary": "p", "touches_files": ["a.sh"]},
    {"name": "Q", "summary": "q", "touches_files": ["b.sh"], "depends": ["P"]}
  ]
}
EOF
flow_env "$FLOW"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
cat > "$FLOW/dispatch-state.json" <<'EOF'
{"checkpoints": {}}
EOF
BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$FLOW/shards/A" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/brief.err")
assert_eq "0" "$(phrase_hits "$BRIEF")" "T2 no already-passed line without a checkpoint"
rm -rf "$FLOW"

# T3: checkpoint for A, but no shard depends on A.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "f",
  "contracts": [
    {"name": "P", "summary": "p", "touches_files": ["a.sh"]},
    {"name": "Q", "summary": "q", "touches_files": ["b.sh"]}
  ]
}
EOF
flow_env "$FLOW"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
cat > "$FLOW/dispatch-state.json" <<'EOF'
{"checkpoints": {"A": "cf-checkpoint/f/shard-A@abc"}}
EOF
BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$FLOW/shards/A" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/brief.err")
assert_eq "0" "$(phrase_hits "$BRIEF")" "T3 no already-passed line when nothing depends on A"
rm -rf "$FLOW"

# T4: dispatch-state.json absent.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "f",
  "contracts": [
    {"name": "P", "summary": "p", "touches_files": ["a.sh"]}
  ]
}
EOF
flow_env "$FLOW"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
[ ! -f "$FLOW/dispatch-state.json" ]
BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$FLOW/shards/A" "goal" "constraints" "bash context-flow/tests/run.sh" 2>"$FLOW/brief.err")
rc=$?
assert_eq "0" "$rc" "T4 brief exits 0 when dispatch-state.json is absent"
assert_eq "0" "$(phrase_hits "$BRIEF")" "T4 no already-passed line when dispatch-state.json is absent"
rm -rf "$FLOW" "$SPECS"

# T6: one commit rule. The fold-a-fix instruction itself carries the checkpoint
# exception, wherever it is given, so no rule has to override a later one.
fold_step=$(grep -F 'Fixing a contract after its commit?' "$PROTOCOL")
assert_contains "$fold_step" "checkpoint" "T6 protocol step 5 names the checkpoint exception"
rebrief=$(grep -F "EXISTING commit" "$SCRIPTS/cf-pi-run.sh")
assert_contains "$rebrief" "checkpoint" "T6b gate-3 re-brief names the checkpoint exception"
assert_eq "0" "$(grep -c 'overrides any later instruction' "$SCRIPTS/cf-pi-brief.sh" || true)" "T6c the brief rule no longer overrides a later one"
