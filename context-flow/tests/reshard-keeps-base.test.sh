#!/usr/bin/env bash
# A partial replan re-runs cf-pi-shard.sh over shards whose worktree already
# exists. cf-pi-worktree.sh skips an existing worktree, so the shard env must
# keep the REPO_ROOT/BASE_BRANCH/BASE_HEAD it was created with -- otherwise the
# scope gate dies on an unbound BASE_HEAD and reports "scope gate error".
# Drives the real shard, worktree and scope scripts over a real git repo.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
TMP="$(mktemp -d)"
REPO="$TMP/repo"; FLOW="$TMP/flow"
mkdir -p "$REPO" "$FLOW"
git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.email t@t; git -C "$REPO" config user.name t
echo base > "$REPO/base.txt"; git -C "$REPO" add -A; git -C "$REPO" commit -qm base
FLOW_START="$(git -C "$REPO" rev-parse HEAD)"

CFROOT="$(cd "$SCRIPTS/.." && pwd)"
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="flow"
CF_SLUG="rk"
PLUGIN_ROOT="$CFROOT"
SCRIPTS="$SCRIPTS"
PI_PROTOCOL="$CFROOT/docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
EOF
touch "$FLOW/cleanup.sh"
(cd "$REPO" && "$SCRIPTS/cf-pi-worktree.sh" "$FLOW") >/dev/null 2>&1
cat > "$FLOW/contracts.json" <<'JSON'
{"schema_version": 1, "contracts": [
  {"name": "P1", "touches_files": ["src/lib.py"]},
  {"name": "C1", "depends": ["P1"], "touches_files": ["src/app.py"]}
]}
JSON
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
sid_of() { jq -r --arg n "$1" '.groups | to_entries[] | select(.value.contracts | index($n)) | .key' "$FLOW/shards.json"; }
P="$(sid_of P1)"; C="$(sid_of C1)"

# P's worktree forks from the flow start; so does the dependent C's, created a
# wave later after the host moved: a shard forks from its flow's BASE_HEAD.
(cd "$REPO" && "$SCRIPTS/cf-pi-worktree.sh" "$FLOW/shards/$P") >/dev/null 2>&1
echo later > "$REPO/later.txt"; git -C "$REPO" add -A; git -C "$REPO" commit -qm later
C_BASE="$FLOW_START"
(cd "$REPO" && "$SCRIPTS/cf-pi-worktree.sh" "$FLOW/shards/$C") >/dev/null 2>&1

base_of() { (. "$FLOW/shards/$1/env.sh"; echo "${BASE_HEAD:-}"); }
assert_eq "$FLOW_START" "$(base_of "$P")" "T0 P base recorded"
assert_eq "$C_BASE" "$(base_of "$C")" "T0 C base recorded"

PW="$FLOW/shards/$P/work"
mkdir -p "$PW/src"; echo x > "$PW/src/lib.py"
git -C "$PW" add -A; git -C "$PW" commit -qm lib

# Partial replan: contracts change, shard re-runs over the existing shards,
# and prepare re-runs the (now skipped) worktree step.
jq '.contracts[1].touches_files += ["src/app2.py"]' "$FLOW/contracts.json" > "$TMP/c.json" \
  && mv "$TMP/c.json" "$FLOW/contracts.json"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
(cd "$REPO" && "$SCRIPTS/cf-pi-worktree.sh" "$FLOW/shards/$P") >/dev/null 2>&1

assert_eq "$FLOW_START" "$(base_of "$P")" "T1 P keeps its base after reshard"
assert_eq "$C_BASE" "$(base_of "$C")" "T2 dependent C keeps the flow's base"
assert_eq "1" "$(grep -c '^BASE_HEAD=' "$FLOW/shards/$P/env.sh")" "T3 BASE_HEAD not duplicated"
assert_eq "1" "$(grep -c '^REPO_ROOT=' "$FLOW/shards/$P/env.sh")" "T3 REPO_ROOT not duplicated"
assert_contains "$(cat "$FLOW/shards/$C/env.sh")" "SHARD_ID=\"$C\"" "T4 generated block rewritten"

out=$("$SCRIPTS/cf-pi-scope.sh" "$FLOW/shards/$P" 2>&1); rc=$?
assert_eq "0" "$rc" "T5 scope gate judges cleanly after reshard ($out)"

echo rogue > "$PW/rogue.txt"
git -C "$PW" add -A; git -C "$PW" commit -qm rogue
out=$("$SCRIPTS/cf-pi-scope.sh" "$FLOW/shards/$P" 2>&1); rc=$?
assert_eq "2" "$rc" "T6 scope gate still catches an undeclared file"
assert_contains "$out" "UNDECLARED rogue.txt" "T6 names the file"

# Dependent shard after the reshard: --prepare-only still merges its
# prerequisite and records the ref the scope gate subtracts.
git -C "$PW" tag cf-checkpoint-P
echo "{\"checkpoints\": {\"$P\": \"cf-checkpoint-P\"}}" > "$FLOW/dispatch-state.json"
(cd "$REPO" && "$SCRIPTS/cf-pi-run.sh" --prepare-only "$FLOW/shards/$C" goal none true) >/dev/null 2>&1
assert_eq "refs/tags/cf-checkpoint-P" "$(cat "$FLOW/shards/$C/prereq-refs" 2>/dev/null)" "T7 dependent prereq-refs filled after reshard"
assert_eq "$C_BASE" "$(base_of "$C")" "T7 dependent base unchanged by prepare"

# Rollback -> reshard -> prepare after the host moved: the re-created worktree
# still forks from the flow's base, and the recorded base says so.
echo host > "$REPO/host.txt"; git -C "$REPO" add -A; git -C "$REPO" commit -qm host
HOST_NOW="$(git -C "$REPO" rev-parse HEAD)"
"$SCRIPTS/cf-pi-rollback.sh" "$FLOW" P1 >/dev/null 2>&1
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
(cd "$REPO" && "$SCRIPTS/cf-pi-run.sh" --prepare-only "$FLOW/shards/$P" goal none true) >/dev/null 2>&1
assert_eq "$FLOW_START" "$(git -C "$PW" rev-parse HEAD 2>/dev/null)" "T8 re-created worktree forks from the flow base, not the moved host ($HOST_NOW)"
assert_eq "$FLOW_START" "$(base_of "$P")" "T8 BASE_HEAD equals the fork point"
assert_eq "1" "$(grep -c '^BASE_HEAD=' "$FLOW/shards/$P/env.sh")" "T8 BASE_HEAD not duplicated"
mkdir -p "$PW/src"; echo y > "$PW/src/lib.py"
git -C "$PW" add -A; git -C "$PW" commit -qm lib2
out=$("$SCRIPTS/cf-pi-scope.sh" "$FLOW/shards/$P" 2>&1); rc=$?
assert_eq "0" "$rc" "T8 scope gate clean after rollback ($out)"

git -C "$REPO" worktree remove --force "$PW" >/dev/null 2>&1
git -C "$REPO" worktree remove --force "$FLOW/shards/$C/work" >/dev/null 2>&1
git -C "$REPO" worktree remove --force "$FLOW/work" >/dev/null 2>&1
rm -rf "$TMP"
