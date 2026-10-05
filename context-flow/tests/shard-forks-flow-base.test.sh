#!/usr/bin/env bash
# A shard forks from its flow's BASE_HEAD, where the parent cf/<slug> forked,
# not from wherever the host HEAD has moved since: a host commit made during
# the flow would otherwise sit in every later shard's base and be replayed onto
# the parent by the integration gate as if it were shard work.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
TMP="$(mktemp -d)"
REPO="$TMP/repo"; FLOW="$TMP/flow"; SHARD="$FLOW/shards/A"
mkdir -p "$REPO" "$SHARD"
git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
echo base >"$REPO/base.txt"; git -C "$REPO" add -A; git -C "$REPO" commit -qm base
FLOW_BASE_HEAD="$(git -C "$REPO" rev-parse HEAD)"

cat >"$FLOW/env.sh" <<EOF2
SESSION="$FLOW"
SESSION_BASENAME="flow"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
REPO_ROOT="$REPO"
BASE_BRANCH="main"
BASE_HEAD="$FLOW_BASE_HEAD"
EOF2
touch "$FLOW/cleanup.sh"
cat >"$SHARD/env.sh" <<EOF2
FLOW_SESSION="$FLOW"
SHARD_ID="A"
SESSION="$SHARD"
SESSION_BASENAME="flow-shard-A"
CF_SLUG="flow-shard-A"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
EOF2

# The user keeps working on main while the flow runs.
echo later >"$REPO/later.txt"; git -C "$REPO" add -A; git -C "$REPO" commit -qm later

(cd "$REPO" && bash "$SCRIPTS/cf-pi-worktree.sh" "$SHARD" >/dev/null 2>"$TMP/err")
assert_eq "BASE_HEAD=\"$FLOW_BASE_HEAD\"" "$(grep '^BASE_HEAD=' "$SHARD/env.sh")" "T1 shard records the flow's BASE_HEAD"
assert_eq "$FLOW_BASE_HEAD" "$(git -C "$SHARD/work" rev-parse HEAD 2>/dev/null)" "T2 shard worktree forks from the flow's BASE_HEAD"
assert_eq "no" "$([ -e "$SHARD/work/later.txt" ] && echo yes || echo no)" "T3 the host's newer commit is not in the shard"

git -C "$REPO" worktree remove --force "$SHARD/work" >/dev/null 2>&1
rm -rf "$TMP"
