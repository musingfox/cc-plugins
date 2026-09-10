#!/usr/bin/env bash
# LINEARIZE_CONFLICT: parent rewrite refused or replay aborted.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
INTEGRATE="$SCRIPTS/cf-pi-integrate.sh"

cleanup_flow() {
  local repo="${1:-}"
  local flow="${2:-}"
  if [ -n "$repo" ] && [ -d "$repo" ]; then
    git -C "$repo" worktree remove --force "$flow/work" >/dev/null 2>&1 || true
    git -C "$repo" worktree remove --force "$flow/integrated-work" >/dev/null 2>&1 || true
  fi
  [ -n "${3:-}" ] && rm -rf "$3"
}

write_shard_env() {
  local flow="$1" sid="$2"
  local base
  base=$(basename "$flow")
  mkdir -p "$flow/shards/$sid"
  cat > "$flow/shards/$sid/env.sh" <<EOF
FLOW_SESSION="$flow"
SHARD_ID="$sid"
SESSION="$flow/shards/$sid"
SESSION_BASENAME="${base}-shard-${sid}"
CF_SLUG="${base}-shard-${sid}"
EOF
}

write_flow_env() {
  local flow="$1" repo="$2" head="$3"
  local base
  base=$(basename "$flow")
  cat > "$flow/env.sh" <<EOF
SESSION="$flow"
SESSION_BASENAME="$base"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
REPO_ROOT="$repo"
BASE_HEAD="$head"
BASE_BRANCH="main"
EOF
}

init_repo() {
  git -C "$1" init -q -b main
  git -C "$1" config core.hooksPath /dev/null
}

tag_and_checkpoint() {
  local repo="$1" flow="$2" sid="$3"
  local sha tag
  sha=$(git -C "$repo" rev-parse HEAD)
  tag="cf-checkpoint/$(basename "$flow")/shard-$sid@$sha"
  git -C "$repo" tag -f "$tag" "$sha"
  echo "$tag"
}

# Fixture 2: independent A (a.txt) and C (c.txt) off base.
setup_fixture_2() {
  local with_parent="${1:-yes}"
  TMP="$(mktemp -d)"
  REPO="$TMP/repo"
  FLOW="$TMP/flow"
  mkdir -p "$REPO" "$FLOW"
  init_repo "$REPO"
  echo base > "$REPO/base.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm base
  BASE_HEAD=$(git -C "$REPO" rev-parse HEAD)

  write_flow_env "$FLOW" "$REPO" "$BASE_HEAD"
  cat > "$FLOW/shards.json" <<'EOF'
{"schema_version":1,"groups":{
  "A":{"shard_id":"A","contracts":["CA"],"files":["a.txt"],"depends_on":[]},
  "C":{"shard_id":"C","contracts":["CC"],"files":["c.txt"],"depends_on":[]}
}}
EOF
  write_shard_env "$FLOW" A
  write_shard_env "$FLOW" C

  local base slug
  base=$(basename "$FLOW")
  slug="cf/${base}-shard"

  git -C "$REPO" checkout -qb "${slug}-A"
  echo a > "$REPO/a.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm A1
  TAG_A=$(tag_and_checkpoint "$REPO" "$FLOW" A)

  git -C "$REPO" checkout -q main
  git -C "$REPO" checkout -qb "${slug}-C"
  echo c > "$REPO/c.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm C1
  TAG_C=$(tag_and_checkpoint "$REPO" "$FLOW" C)
  git -C "$REPO" checkout -q main

  jq -n --arg a "$TAG_A" --arg c "$TAG_C" \
    '{checkpoints:{A:$a,C:$c}}' > "$FLOW/dispatch-state.json"

  if [ "$with_parent" = yes ]; then
    git -C "$REPO" worktree add -b "cf/$base" "$FLOW/work" "$BASE_HEAD" >/dev/null
  fi
}

run_integrate() {
  bash "$INTEGRATE" "$FLOW" true
}

# --- LandingPreconditionRefusal T1: dirty parent -----------------------------

setup_fixture_2
echo scratch > "$FLOW/work/scratch.txt"
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "T1 exit 5"
assert_json "$FLOW/integration-result.json" '.reason' "parent_dirty" "T1 reason"
assert_json "$FLOW/integration-result.json" '.parent_prior_tip' "$BASE_HEAD" "T1 parent_prior_tip"
head_now=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$BASE_HEAD" "$head_now" "T1 parent HEAD unchanged"
assert_eq "yes" "$([ -f "$FLOW/work/scratch.txt" ] && echo yes || echo no)" "T1 scratch.txt kept"
base=$(basename "$FLOW")
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-integrated"
assert_eq "0" "$?" "T1 integrated branch exists"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- LandingPreconditionRefusal T2: missing parent ---------------------------

setup_fixture_2 no
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "T2 exit 5"
assert_json "$FLOW/integration-result.json" '.reason' "parent_missing" "T2 reason"
base=$(basename "$FLOW")
assert_json "$FLOW/integration-result.json" '.integration_branch' "cf/${base}-integrated" "T2 integration_branch"
assert_json "$FLOW/integration-result.json" '.parent_prior_tip' "null" "T2 parent_prior_tip null"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- LandingPreconditionRefusal T3: dependency cycle -------------------------

setup_fixture_2
cat > "$FLOW/shards.json" <<'EOF'
{"schema_version":1,"groups":{
  "A":{"shard_id":"A","contracts":["CA"],"files":["a.txt"],"depends_on":["C"]},
  "C":{"shard_id":"C","contracts":["CC"],"files":["c.txt"],"depends_on":["A"]}
}}
EOF
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "T3 exit 5"
assert_json "$FLOW/integration-result.json" '.reason' "dependency_cycle" "T3 reason"
head_now=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$BASE_HEAD" "$head_now" "T3 parent HEAD unchanged"
cleanup_flow "$REPO" "$FLOW" "$TMP"
