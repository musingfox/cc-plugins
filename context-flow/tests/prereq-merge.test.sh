#!/usr/bin/env bash
# Tests for cf-pi-run.sh step 1b: prerequisite checkpoints merged into a
# dependent shard's worktree base before the brief is assembled.
# Pure-local: the run is cut short at the probe (bogus PI_BIN), which is late
# enough — worktree, prereq merge, and brief all happen before the probe.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
TMP="$(mktemp -d)"
REPO="$TMP/repo"
FLOW="$TMP/flow"
export PI_RUNS_DIR="$TMP/runs"   # keep write_outcome's index off the real ledger
export PI_BIN="$TMP/no-such-omp" # probe fails fast, after the parts under test

# --- repo: main with a base commit -------------------------------------------
mkdir -p "$REPO"
git -C "$REPO" init -q -b main
echo base > "$REPO/base.txt"
git -C "$REPO" add -A && git -C "$REPO" commit -qm base

# --- flow session: A provides src/lib.py, B depends on A ---------------------
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
PI_PROVIDER=""
PI_MODEL=""
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
EOF
touch "$FLOW/cleanup.sh"

"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
A_SID=$(jq -r '.groups | to_entries[] | select(.value.contracts | index("ProvideLib")) | .key' "$FLOW/shards.json")
B_SID=$(jq -r '.groups | to_entries[] | select(.value.contracts | index("ConsumeLib")) | .key' "$FLOW/shards.json")
B_SESSION="$FLOW/shards/$B_SID"

# cf-pi-worktree.sh forks from the caller's cwd repo.
cd "$REPO"

# T1: dispatching B before A has a PASS checkpoint -> FAIL prereq-missing.
bash "$SCRIPTS/cf-pi-run.sh" "$B_SESSION" goal constraints "true" >/dev/null 2>&1
rc=$?
assert_eq "1" "$rc" "T1 exits 1"
assert_contains "$(sed -n '/^## Status/{n;p;q;}' "$B_SESSION/outcome.md")" "FAIL" "T1 outcome FAIL"
assert_contains "$(sed -n '/^## Reason/{n;p;q;}' "$B_SESSION/outcome.md")" "prereq-missing" "T1 reason prereq-missing"

# --- simulate shard A PASS: branch with the interface + recorded checkpoint ---
git -C "$REPO" checkout -qb "cf/$FLOW_BASE-shard-$A_SID"
mkdir -p "$REPO/src" && echo "def api(): pass" > "$REPO/src/lib.py"
git -C "$REPO" add -A && git -C "$REPO" commit -qm "ProvideLib: interface"
git -C "$REPO" checkout -q main
REPO_ROOT="$REPO" FLOW_SESSION="$FLOW" \
  "$SCRIPTS/cf-pi-record-round.sh" --round 1 --result "$A_SID=PASS" >/dev/null

# T2: re-dispatch B (same worktree, idempotent reuse) -> prereq merged, brief
# carries the PREREQUISITES line, and the run proceeds past 1b (dies at probe).
bash "$SCRIPTS/cf-pi-run.sh" "$B_SESSION" goal constraints "true" >/dev/null 2>&1
assert_contains "$(sed -n '/^## Reason/{n;p;q;}' "$B_SESSION/outcome.md")" "probe" "T2 got past 1b (fails at probe)"
assert_eq "yes" "$([ -f "$B_SESSION/work/src/lib.py" ] && echo yes || echo no)" \
  "T2 prerequisite file present in worktree"
assert_contains "$(cat "$B_SESSION/prereq-merged")" "$A_SID" "T2 manifest lists prerequisite shard"
assert_contains "$(grep 'PREREQUISITES' "$B_SESSION/implement-brief.md")" "ProvideLib" \
  "T2 brief names the merged prerequisite contracts"

# T3: second re-dispatch is idempotent (merge already an ancestor, still sane).
bash "$SCRIPTS/cf-pi-run.sh" "$B_SESSION" goal constraints "true" >/dev/null 2>&1
assert_contains "$(sed -n '/^## Reason/{n;p;q;}' "$B_SESSION/outcome.md")" "probe" "T3 idempotent re-run reaches probe"

cd /
git -C "$REPO" worktree remove --force "$B_SESSION/work" 2>/dev/null || true
rm -rf "$TMP"
