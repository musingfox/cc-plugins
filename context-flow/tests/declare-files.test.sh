#!/usr/bin/env bash
# cf-pi-declare-files.sh: a file a review finding asks the builder to delete or
# create, once the human approves it, is declared on a contract before the
# re-launch, so the scope gate passes it. Anything else stays undeclared.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
TMP="$(mktemp -d /tmp/cf-declare-XXXXXX)"
REPO="$TMP/repo"
FLOW="$TMP/flow"

mkdir -p "$REPO" "$FLOW"
git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
echo orphan > "$REPO/orphan.txt"
git -C "$REPO" add -A && git -C "$REPO" commit -qm base
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
A=$(jq -r '.groups | to_entries[] | select(.value.contracts | index("Alpha")) | .key' "$FLOW/shards.json")

cd "$REPO"
wt=$("$SCRIPTS/cf-pi-worktree.sh" "$FLOW/shards/$A" 2>/dev/null)
echo a > "$wt/a.txt"; echo stray > "$wt/stray.txt"; git -C "$wt" rm -q orphan.txt
git -C "$wt" add -A && git -C "$wt" commit -qm "alpha, orphan removed"
scope() { "$SCRIPTS/cf-pi-scope.sh" "$FLOW/shards/$A" 2>&1; }

out=$(scope); rc=$?
assert_eq 2 "$rc" "T0 before declaring: scope gate fails"
assert_contains "$out" "orphan.txt" "T0 before declaring: the deleted orphan is undeclared"

# T1: declaring the approved file adds it to the contract and its shard.
out=$("$SCRIPTS/cf-pi-declare-files.sh" "$FLOW" Alpha orphan.txt); rc=$?
assert_eq 0 "$rc" "T1 exit"
assert_eq "DECLARED Alpha orphan.txt shard-$A" "$out" "T1 stdout"
assert_eq true "$(jq '.contracts[] | select(.name=="Alpha") | .touches_files | index("orphan.txt") != null' "$FLOW/contracts.json")" "T1 contract declares the file"
assert_eq true "$(jq --arg s "$A" '.groups[$s].files | index("orphan.txt") != null' "$FLOW/shards.json")" "T1 shard declares the file"

# T2: the approved file passes; an unapproved one still fails the gate.
out=$(scope); rc=$?
assert_eq 2 "$rc" "T2 scope gate still fails on the stray file"
assert_eq "UNDECLARED stray.txt" "$(printf '%s\n' "$out" | grep '^UNDECLARED')" "T2 only the stray file is undeclared"

# T3: re-declaring is a no-op on the contract.
"$SCRIPTS/cf-pi-declare-files.sh" "$FLOW" Alpha orphan.txt >/dev/null
assert_eq 1 "$(jq '[.contracts[] | select(.name=="Alpha") | .touches_files[] | select(. == "orphan.txt")] | length' "$FLOW/contracts.json")" "T3 no duplicate entry"

# T4: an unknown contract changes nothing.
before=$(cat "$FLOW/contracts.json")
"$SCRIPTS/cf-pi-declare-files.sh" "$FLOW" Gamma x.txt >/dev/null 2>&1; rc=$?
assert_eq 5 "$rc" "T4 unknown contract exit"
assert_eq "$before" "$(cat "$FLOW/contracts.json")" "T4 contracts.json untouched"

# T5: usage
"$SCRIPTS/cf-pi-declare-files.sh" "$FLOW" Alpha >/dev/null 2>&1; rc=$?
assert_eq 2 "$rc" "T5 no file is a usage error"

cd /
git -C "$REPO" worktree remove --force "$wt" >/dev/null 2>&1
rm -rf "$TMP"
