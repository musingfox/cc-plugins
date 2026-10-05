#!/usr/bin/env bash
# Tests for cf-pi-rollback.sh and the cf.md §3.5 rollback budget guard.
# Real repo, real shard worktrees, flow under /tmp (a symlink on darwin, as
# cf-pi-setup.sh places it).
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
GUARD_FILTER=$(grep -o "jq -r '[^']*rollback-exhausted\"'" "$CF_TESTS_DIR/../commands/cf.md" | sed "s/^jq -r '//; s/'\$//")
TMP="$(mktemp -d /tmp/cf-rollback-XXXXXX)"
REPO="$TMP/repo"
FLOW="$TMP/flow"
STATE="$FLOW/dispatch-state.json"
guard() { jq -r "$GUARD_FILTER" "$STATE"; }

mkdir -p "$REPO" "$FLOW"
git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
git -C "$REPO" commit -q --allow-empty -m base
cat > "$FLOW/contracts.json" <<'EOF'
{"schema_version": 1, "flow_id": "t", "contracts": [
  {"name": "Alpha", "touches_files": ["a.txt"]},
  {"name": "Beta", "touches_files": ["b.txt"]}
]}
EOF
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="$(basename "$FLOW")"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
REPO_ROOT="$REPO"
EOF
touch "$FLOW/cleanup.sh"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
sid_of() { jq -r --arg c "$1" '.groups | to_entries[] | select(.value.contracts | index($c)) | .key' "$FLOW/shards.json"; }
A=$(sid_of Alpha); B=$(sid_of Beta)
branch_of() { echo "cf/$(grep -E '^CF_SLUG=' "$FLOW/shards/$1/env.sh" | tail -1 | sed 's/^CF_SLUG="\(.*\)"$/\1/')"; }

cd "$REPO"
for s in "$A" "$B"; do
  wt=$("$SCRIPTS/cf-pi-worktree.sh" "$FLOW/shards/$s")
  echo "$s" > "$wt/$s.txt"
  git -C "$wt" add -A && git -C "$wt" commit -qm "validated $s"
done
A_BRANCH=$(branch_of "$A"); B_BRANCH=$(branch_of "$B")
B_HEAD=$(git rev-parse "$B_BRANCH")
"$SCRIPTS/cf-pi-record-round.sh" "$FLOW" --round 1 --result "$A=PASS" --result "$B=PASS" >/dev/null

# T1: a state record-round just wrote does not trip the guard.
assert_eq "" "$(guard)" "T1 fresh state: guard silent"
assert_eq "0" "$(jq -r '.rollback_count' "$STATE")" "T1 rollback_count starts at 0"

# T2: rollback by contract name clears the mapped shard and keeps its work.
out=$("$SCRIPTS/cf-pi-rollback.sh" "$FLOW" Beta)
assert_eq "false" "$(jq '.checkpoints | has("'"$B"'")' "$STATE")" "T2 checkpoint of Beta's shard cleared"
assert_eq "true" "$(jq '.checkpoints | has("'"$A"'")' "$STATE")" "T2 checkpoint of Alpha's shard kept"
assert_eq "1" "$(jq -r '.rollback_count' "$STATE")" "T2 one cycle counted"
assert_eq "" "$(guard)" "T2 guard silent after one cycle"
assert_contains "$out" "retained tag cf-checkpoint/" "T2 reports the real checkpoint tag"
assert_eq "0" "$(git worktree list --porcelain | grep -c "shards/$B/work")" "T2 worktree unregistered"
assert_eq "1" "$(git worktree list --porcelain | grep -c "shards/$A/work")" "T2 other worktree untouched"
assert_eq "" "$(git branch --list "$B_BRANCH")" "T2 shard branch deleted"
assert_eq "$B_HEAD" "$(git for-each-ref --format='%(objectname)' "refs/cf-rollback/")" "T2 validated head still reachable"
assert_exit 0 "$SCRIPTS/cf-pi-worktree.sh" "$FLOW/shards/$B"

# T3: an unmapped contract name fails loudly and changes nothing.
assert_exit 5 "$SCRIPTS/cf-pi-rollback.sh" "$FLOW" Nope
assert_eq "1" "$(jq -r '.rollback_count' "$STATE")" "T3 count unchanged"

# T4: a malformed state stops the rollback before anything is deleted.
cp "$STATE" "$TMP/good-state"
echo '[not json' > "$STATE"
assert_exit 6 "$SCRIPTS/cf-pi-rollback.sh" "$FLOW" Alpha
assert_eq "[not json" "$(cat "$STATE")" "T4 malformed state left intact"
assert_eq "$A_BRANCH" "$(git branch --list "$A_BRANCH" | tr -d ' *+')" "T4 branch not deleted"
cp "$TMP/good-state" "$STATE"

# T5: the third cycle exhausts the per-flow budget.
"$SCRIPTS/cf-pi-rollback.sh" "$FLOW" Alpha >/dev/null
assert_eq "" "$(guard)" "T5 guard silent after two cycles"
"$SCRIPTS/cf-pi-rollback.sh" "$FLOW" Alpha Beta >/dev/null
assert_eq "3" "$(jq -r '.rollback_count' "$STATE")" "T5 one increment per invocation"
assert_eq "rollback-exhausted" "$(guard)" "T5 guard fires at the budget"

# T6: a flow started before the fix keeps rollback_count {}; the guard reads it as 0.
echo '{"rollback_count":{}}' > "$STATE"
assert_eq "" "$(guard)" "T6 legacy object count: guard silent"

# T7: cf.md's success-path cleanup leaves no rollback ref behind.
CLEANUP_BLOCK=$(awk '/^### Scaffolding leaves no trace/{f=1} f&&/^```bash/{b=1;next} b&&/^```/{exit} b' "$CF_TESTS_DIR/../commands/cf.md")
assert_contains "$CLEANUP_BLOCK" "cf-pi-cleanup.sh" "T7 cleanup block runs the cleanup script"
(SESSION="$FLOW" CF_SLUG="$(basename "$FLOW")" && eval "$CLEANUP_BLOCK")
assert_eq "" "$(git for-each-ref "refs/cf-rollback/")" "T7 no rollback ref after success cleanup"

cd /
rm -rf "$TMP"
