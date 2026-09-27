#!/usr/bin/env bash
# cf-pi-prepare.sh readies ONE shard for either builder: worktree on the shard
# branch, BASE_HEAD recorded, prerequisite checkpoints merged, brief assembled.
# Real repo, real sibling scripts, cwd = repo (cf-pi-worktree.sh forks from it).
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
PREPARE="$SCRIPTS/cf-pi-prepare.sh"
TMP="$(mktemp -d)"
REPO="$TMP/repo"
FLOW="$TMP/flow"

mkdir -p "$REPO"
git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
echo base > "$REPO/base.txt"
git -C "$REPO" add -A && git -C "$REPO" commit -qm base
REPO_HEAD="$(git -C "$REPO" rev-parse HEAD)"

# A provides src/lib.py; B consumes it and depends on A.
mkdir -p "$FLOW"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {"name": "ProvideLib", "touches_files": ["src/lib.py"]},
    {"name": "ConsumeLib", "depends": ["ProvideLib"], "touches_files": ["src/app.py"]}
  ]
}
EOF
FLOW_BASE="$(basename "$FLOW")"
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="$FLOW_BASE"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
PI_PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
EOF
touch "$FLOW/cleanup.sh"

"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
A_SID=$(jq -r '.groups | to_entries[] | select(.value.contracts | index("ProvideLib")) | .key' "$FLOW/shards.json")
B_SID=$(jq -r '.groups | to_entries[] | select(.value.contracts | index("ConsumeLib")) | .key' "$FLOW/shards.json")
A_SESSION="$FLOW/shards/$A_SID"
B_SESSION="$FLOW/shards/$B_SID"

cd "$REPO"

# prepare [SCRIPT] SESSION -> OUT (stdout), RC
prepare() {
  local script="$PREPARE"
  [ $# -lt 2 ] || { script="$1"; shift; }
  OUT="$(bash "$script" "$1" goal c true 2>"$TMP/prepare.err")"
  RC=$?
}
last_line() { printf '%s\n' "$OUT" | tail -1; }

# T1: a fresh shard with no depends_on
prepare "$A_SESSION"
assert_eq "PREPARED $A_SESSION/implement-brief.md" "$(last_line)" "T1 last line"
assert_eq "0" "$RC" "T1 exit"
assert_eq "cf/$FLOW_BASE-shard-$A_SID" "$(git -C "$A_SESSION/work" rev-parse --abbrev-ref HEAD 2>/dev/null)" \
  "T1 worktree is on the shard branch"
assert_eq "BASE_HEAD=\"$REPO_HEAD\"" "$(grep '^BASE_HEAD=' "$A_SESSION/env.sh")" "T1 env.sh records BASE_HEAD"
assert_contains "$(cat "$A_SESSION/implement-brief.md" 2>/dev/null)" "## Behavioral Contracts (this shard)" \
  "T1 brief assembled"

# T2: a second call reuses the worktree
a_head="$(git -C "$A_SESSION/work" rev-parse HEAD 2>/dev/null)"
prepare "$A_SESSION"
assert_eq "PREPARED $A_SESSION/implement-brief.md" "$(last_line)" "T2 last line"
assert_eq "$a_head" "$(git -C "$A_SESSION/work" rev-parse HEAD 2>/dev/null)" "T2 same worktree HEAD"

# T5: a stale manifest from a round that still had depends_on is dropped
printf 'Z\tOldContract\n' > "$A_SESSION/prereq-merged"
prepare "$A_SESSION"
assert_eq "0" "$RC" "T5 exit"
assert_eq "absent" "$([ -e "$A_SESSION/prereq-merged" ] && echo present || echo absent)" \
  "T5 stale prereq-merged removed"
assert_eq "0" "$(grep -c 'PREREQUISITES' "$A_SESSION/implement-brief.md" || true)" \
  "T5 brief has no PREREQUISITES line"

# T4: dependent shard before its prerequisite has a checkpoint
prepare "$B_SESSION"
assert_eq "FAIL prereq-missing $A_SID" "$(last_line)" "T4 last line"
assert_eq "1" "$RC" "T4 exit"

# Shard A passes: its interface is committed on its branch and checkpointed.
mkdir -p "$A_SESSION/work/src" && echo "def api(): pass" > "$A_SESSION/work/src/lib.py"
git -C "$A_SESSION/work" add -A && git -C "$A_SESSION/work" commit -qm "ProvideLib: interface"
REPO_ROOT="$REPO" FLOW_SESSION="$FLOW" \
  "$SCRIPTS/cf-pi-record-round.sh" --round 1 --result "$A_SID=PASS" >/dev/null
A_TAG=$(jq -r --arg s "$A_SID" '.checkpoints[$s] // empty' "$FLOW/dispatch-state.json")

# T7: red first, a prepare that skips the merge leaves B without lib.py. Runs
# before T3 so B's worktree has not merged the checkpoint yet.
mkdir -p "$TMP/mut"
ln -s "$SCRIPTS/cf-pi-env.sh" "$TMP/mut/cf-pi-env.sh"
perl -pe 's/git -C "\$WORK" merge --no-edit "refs\/tags\/\$ref"/true/' "$PREPARE" > "$TMP/mut/cf-pi-prepare.sh"
applied=yes; cmp -s "$PREPARE" "$TMP/mut/cf-pi-prepare.sh" && applied=no
assert_eq "yes" "$applied" "T7 mutation applies"
prepare "$TMP/mut/cf-pi-prepare.sh" "$B_SESSION"
assert_eq "PREPARED $B_SESSION/implement-brief.md" "$(last_line)" "T7 the mutant still prepares"
assert_eq "missing" "$([ -f "$B_SESSION/work/src/lib.py" ] && echo present || echo missing)" \
  "T7 without the merge, T3's lib.py check fails"

# T3: dependent shard with its prerequisite's checkpoint recorded
prepare "$B_SESSION"
assert_eq "PREPARED $B_SESSION/implement-brief.md" "$(last_line)" "T3 last line"
assert_eq "present" "$([ -f "$B_SESSION/work/src/lib.py" ] && echo present || echo missing)" \
  "T3 prerequisite file merged into the worktree"
assert_contains "$(cat "$B_SESSION/prereq-refs" 2>/dev/null)" "refs/tags/$A_TAG" "T3 prereq-refs names the checkpoint"
assert_contains "$(grep 'PREREQUISITES' "$B_SESSION/implement-brief.md")" "ProvideLib" \
  "T3 brief names the merged prerequisite contracts"

cd /
git -C "$REPO" worktree remove --force "$A_SESSION/work" 2>/dev/null || true
git -C "$REPO" worktree remove --force "$B_SESSION/work" 2>/dev/null || true
rm -rf "$TMP"
