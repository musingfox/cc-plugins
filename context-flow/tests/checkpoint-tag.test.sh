#!/usr/bin/env bash
# Tests for CheckpointTagOnPass contract via cf-pi-record-round.sh
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

# T1: given a git repo with branch cf/<flow>-shard-A at sha S, record-round --round 1 --result A=PASS
# -> expect git tag -l 'cf-checkpoint/*shard-A*' is non-empty and resolves to sha S
REPO_ROOT="$(mktemp -d)"
export REPO_ROOT
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
cd "$REPO_ROOT"
git init -q
git commit --allow-empty -m init -q
git checkout -b cf/myflow-shard-A -q
sha=$(git rev-parse HEAD)
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS
tag=$(git tag -l 'cf-checkpoint/*shard-A*' | head -1)
assert_contains "$tag" "shard-A" "T1 tag name contains shard-A"
tag_sha=$(git rev-parse "$tag")
assert_eq "$sha" "$tag_sha" "T1 tag points to S"
rm -rf "$REPO_ROOT" "$FLOW_SESSION"

# T2: given record-round --round 1 --result A=PASS -> expect dispatch-state.json .checkpoints.A matches the created tag name
REPO_ROOT="$(mktemp -d)"
export REPO_ROOT
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
cd "$REPO_ROOT"
git init -q
git commit --allow-empty -m init -q
git checkout -b cf/myflow-shard-A -q
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS
tag_in_state=$(jq -r '.checkpoints.A' "$FLOW_SESSION/dispatch-state.json")
assert_contains "$tag_in_state" "cf-checkpoint/" "T2 checkpoints.A has cf-checkpoint/"
assert_contains "$tag_in_state" "shard-A@" "T2 checkpoints.A has shard-A@"
rm -rf "$REPO_ROOT" "$FLOW_SESSION"

# T3: given --result B=NEEDS_REPLAN (not PASS) -> expect no cf-checkpoint tag for shard-B and .checkpoints has no key B
REPO_ROOT="$(mktemp -d)"
export REPO_ROOT
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
mkdir -p "$FLOW_SESSION"
cd "$REPO_ROOT"
git init -q
git commit --allow-empty -m init -q
git checkout -b cf/myflow-shard-B -q
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result B=NEEDS_REPLAN
tag_count=$(git tag -l 'cf-checkpoint/*shard-B*' | wc -l | tr -d ' ')
assert_eq "0" "$tag_count" "T3 no tag for NEEDS_REPLAN"
has_b=$(jq 'has("B")' "$FLOW_SESSION/dispatch-state.json" 2>/dev/null || echo false)
assert_eq "false" "$has_b" "T3 no checkpoints.B"
rm -rf "$REPO_ROOT" "$FLOW_SESSION"

# T5: given the shard branch checked out in a LINKED WORKTREE (repo HEAD stays
# main — the live-run shape) -> expect tag exists AND checkpoints.A carries the
# real sha (regression pin: `branch --list` marks worktree branches with '+',
# which used to leak into rev-parse and record a phantom `@+cf/...` ref).
REPO_ROOT="$(mktemp -d)"
export REPO_ROOT
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
cd "$REPO_ROOT"
git init -q -b main
git commit --allow-empty -m init -q
WT="$(mktemp -d)/wt"
git worktree add -b cf/myflow-shard-A "$WT" -q
sha=$(git rev-parse cf/myflow-shard-A)
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS
tag=$(git tag -l 'cf-checkpoint/*shard-A*' | head -1)
assert_contains "$tag" "shard-A@$sha" "T5 tag carries real sha (worktree branch)"
tag_sha=$(git rev-parse "$tag" 2>/dev/null || echo MISSING)
assert_eq "$sha" "$tag_sha" "T5 tag resolves to sha"
tag_in_state=$(jq -r '.checkpoints.A' "$FLOW_SESSION/dispatch-state.json")
assert_eq "$tag" "$tag_in_state" "T5 state matches the real tag"
git worktree remove --force "$WT" 2>/dev/null || true
rm -rf "$REPO_ROOT" "$FLOW_SESSION"

# T4: given REPO_ROOT empty (non-git scratch mode) -> expect exit code 0, no tag attempted, .checkpoints unchanged (graceful degrade)
FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION
REPO_ROOT=""
export REPO_ROOT
mkdir -p "$FLOW_SESSION"
"$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS
assert_exit 0 "$CF_TESTS_DIR/../scripts/cf-pi-record-round.sh" --round 1 --result A=PASS
# checkpoints may be empty or not have A since no git
has_a=$(jq 'has("A")' "$FLOW_SESSION/dispatch-state.json" 2>/dev/null || echo false)
assert_eq "false" "$has_a" "T4 no checkpoints.A in non-git"
rm -rf "$FLOW_SESSION"
