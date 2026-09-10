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

# Every LINEARIZE_CONFLICT result carries the full contract key set.
assert_conflict_keys() {
  local file="$1" msg="$2"
  if jq -e 'has("merged_shards") and has("parent_branch") and has("parent_prior_tip")
            and has("offending_shard") and has("offending_commit") and has("integration_branch")' \
      "$file" >/dev/null 2>&1; then
    _assert_pass
  else
    _assert_fail "$msg: result JSON missing a contract key: $(jq -c 'keys' "$file" 2>/dev/null)"
  fi
  assert_json "$file" '.status' "LINEARIZE_CONFLICT" "$msg status"
  assert_json "$file" '.parent_branch' "cf/$(basename "$FLOW")" "$msg parent_branch"
}

# --- LandingPreconditionRefusal T1: dirty parent -----------------------------

setup_fixture_2
echo scratch > "$FLOW/work/scratch.txt"
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "T1 exit 5"
assert_json "$FLOW/integration-result.json" '.reason' "parent_dirty" "T1 reason"
assert_conflict_keys "$FLOW/integration-result.json" "T1"
assert_json "$FLOW/integration-result.json" '.merged_shards | join(",")' "A,C" "T1 merged_shards"
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
assert_conflict_keys "$FLOW/integration-result.json" "T2"
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
assert_conflict_keys "$FLOW/integration-result.json" "T3"
head_now=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$BASE_HEAD" "$head_now" "T3 parent HEAD unchanged"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- LandingPreconditionRefusal T4: parent checked out on a foreign branch ----

setup_fixture_2 no
base=$(basename "$FLOW")
git -C "$REPO" worktree add -b some/other-branch "$FLOW/work" "$BASE_HEAD" >/dev/null
run_integrate >/dev/null 2>"$TMP/stderr"
rc=$?
assert_eq "5" "$rc" "T4 exit 5"
assert_json "$FLOW/integration-result.json" '.reason' "parent_wrong_branch" "T4 reason"
assert_conflict_keys "$FLOW/integration-result.json" "T4"
assert_json "$FLOW/integration-result.json" '.parent_prior_tip' "$BASE_HEAD" "T4 parent_prior_tip"
assert_eq "refs/heads/some/other-branch" "$(git -C "$FLOW/work" symbolic-ref HEAD)" "T4 parent still on its own branch"
assert_eq "$BASE_HEAD" "$(git -C "$FLOW/work" rev-parse HEAD)" "T4 parent HEAD unchanged"
assert_eq "0" "$(grep -c 'fatal:' "$TMP/stderr" || true)" "T4 no raw git fatal on stderr"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}"
assert_eq "1" "$?" "T4 cf/<slug> was never created"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- LandingPreconditionRefusal T5: every shard skipped (bash 3.2 empty array)

setup_fixture_2
base=$(basename "$FLOW")
git -C "$REPO" branch -D "cf/${base}-shard-A" "cf/${base}-shard-C" >/dev/null
run_integrate >/dev/null 2>"$TMP/stderr"
rc=$?
assert_eq "5" "$rc" "T5 exit 5"
assert_eq "yes" "$([ -f "$FLOW/integration-result.json" ] && echo yes || echo no)" "T5 result JSON written"
assert_json "$FLOW/integration-result.json" '.reason' "no_shards_merged" "T5 reason"
assert_conflict_keys "$FLOW/integration-result.json" "T5"
assert_json "$FLOW/integration-result.json" '.merged_shards | length' "0" "T5 merged_shards empty"
assert_eq "$BASE_HEAD" "$(git -C "$FLOW/work" rev-parse HEAD)" "T5 parent HEAD unchanged"
assert_eq "0" "$(grep -c 'unbound variable' "$TMP/stderr" || true)" "T5 no unbound-variable crash"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# Fixture 3: A, C independent; D depends_on [A,C] via merge commit + D1.
setup_fixture_3() {
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
  "C":{"shard_id":"C","contracts":["CC"],"files":["c.txt"],"depends_on":[]},
  "D":{"shard_id":"D","contracts":["CD"],"files":["d.txt"],"depends_on":["A","C"]}
}}
EOF
  write_shard_env "$FLOW" A
  write_shard_env "$FLOW" C
  write_shard_env "$FLOW" D

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

  git -C "$REPO" checkout -qb "${slug}-D" "$TAG_A"
  git -C "$REPO" merge --no-edit "$TAG_C" >/dev/null
  echo d > "$REPO/d.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm D1
  TAG_D=$(tag_and_checkpoint "$REPO" "$FLOW" D)
  git -C "$REPO" checkout -q main

  jq -n --arg a "$TAG_A" --arg c "$TAG_C" --arg d "$TAG_D" \
    '{checkpoints:{A:$a,C:$c,D:$d}}' > "$FLOW/dispatch-state.json"

  git -C "$REPO" worktree add -b "cf/$base" "$FLOW/work" "$BASE_HEAD" >/dev/null
}

# Fixture 4: A and B both touch f.txt; merge is clean, linear replay is not.
setup_fixture_4() {
  TMP="$(mktemp -d)"
  REPO="$TMP/repo"
  FLOW="$TMP/flow"
  mkdir -p "$REPO" "$FLOW"
  init_repo "$REPO"
  echo base > "$REPO/f.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm base
  BASE_HEAD=$(git -C "$REPO" rev-parse HEAD)

  write_flow_env "$FLOW" "$REPO" "$BASE_HEAD"
  cat > "$FLOW/shards.json" <<'EOF'
{"schema_version":1,"groups":{
  "A":{"shard_id":"A","contracts":["CA"],"files":["f.txt"],"depends_on":[]},
  "B":{"shard_id":"B","contracts":["CB"],"files":["f.txt","b.txt"],"depends_on":[]}
}}
EOF
  write_shard_env "$FLOW" A
  write_shard_env "$FLOW" B

  local base slug
  base=$(basename "$FLOW")
  slug="cf/${base}-shard"

  git -C "$REPO" checkout -qb "${slug}-A"
  echo x > "$REPO/f.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm A1
  TAG_A=$(tag_and_checkpoint "$REPO" "$FLOW" A)

  git -C "$REPO" checkout -q main
  git -C "$REPO" checkout -qb "${slug}-B"
  echo y > "$REPO/f.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm B1
  SHA_B1=$(git -C "$REPO" rev-parse HEAD)
  echo base > "$REPO/f.txt"
  echo b > "$REPO/b.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm B2
  TAG_B=$(tag_and_checkpoint "$REPO" "$FLOW" B)
  git -C "$REPO" checkout -q main

  jq -n --arg a "$TAG_A" --arg b "$TAG_B" \
    '{checkpoints:{A:$a,B:$b}}' > "$FLOW/dispatch-state.json"

  git -C "$REPO" worktree add -b "cf/$base" "$FLOW/work" "$BASE_HEAD" >/dev/null
}

assert_no_sequencer() {
  local wt="$1" msg="$2"
  local cp seq porcelain
  cp=$(git -C "$wt" rev-parse --git-path CHERRY_PICK_HEAD)
  seq=$(git -C "$wt" rev-parse --git-path sequencer)
  if [ -e "$cp" ]; then _assert_fail "$msg CHERRY_PICK_HEAD present"; else _assert_pass; fi
  if [ -e "$seq" ]; then _assert_fail "$msg sequencer present"; else _assert_pass; fi
  porcelain=$(git -C "$wt" status --porcelain)
  assert_eq "" "$porcelain" "$msg porcelain empty"
}

# --- LinearizeConflictAborts T1 ----------------------------------------------

setup_fixture_4
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "L1 exit 5"
assert_json "$FLOW/integration-result.json" '.status' "LINEARIZE_CONFLICT" "L1 status"
assert_json "$FLOW/integration-result.json" '.reason' "cherry_pick_conflict" "L1 reason"
assert_json "$FLOW/integration-result.json" '.offending_shard' "B" "L1 offending_shard"
assert_conflict_keys "$FLOW/integration-result.json" "L1"
assert_json "$FLOW/integration-result.json" '.offending_commit' "$SHA_B1" "L1 offending_commit is B1"
assert_json "$FLOW/integration-result.json" '.merged_shards | join(",")' "A,B" "L1 merged_shards"
base=$(basename "$FLOW")
assert_json "$FLOW/integration-result.json" '.integration_branch' "cf/${base}-integrated" "L1 integration_branch"
head_now=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$BASE_HEAD" "$head_now" "L1 parent HEAD is BASE_HEAD"
assert_no_sequencer "$FLOW/work" "L1"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-integrated"
assert_eq "0" "$?" "L1 integrated branch exists"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-shard-A"
assert_eq "0" "$?" "L1 shard A exists"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-shard-B"
assert_eq "0" "$?" "L1 shard B exists"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- LinearizeConflictAborts T2: conflict on rerun keeps prior landing --------

setup_fixture_4
# First run with only A registered.
base=$(basename "$FLOW")
slug="cf/${base}-shard"
jq -n --arg a "$TAG_A" '{checkpoints:{A:$a}}' > "$FLOW/dispatch-state.json"
cat > "$FLOW/shards.json" <<'EOF'
{"schema_version":1,"groups":{
  "A":{"shard_id":"A","contracts":["CA"],"files":["f.txt"],"depends_on":[]}
}}
EOF
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "0" "$rc" "L2 first run exit 0"
T2_HEAD=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "A1" "$(git -C "$FLOW/work" log -1 --pretty=%s)" "L2 first landing is A1"

# Register B and rerun.
write_shard_env "$FLOW" B
cat > "$FLOW/shards.json" <<'EOF'
{"schema_version":1,"groups":{
  "A":{"shard_id":"A","contracts":["CA"],"files":["f.txt"],"depends_on":[]},
  "B":{"shard_id":"B","contracts":["CB"],"files":["f.txt","b.txt"],"depends_on":[]}
}}
EOF
jq -n --arg a "$TAG_A" --arg b "$TAG_B" '{checkpoints:{A:$a,B:$b}}' > "$FLOW/dispatch-state.json"
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "L2 second run exit 5"
head_now=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$T2_HEAD" "$head_now" "L2 parent stays at first landing"
assert_json "$FLOW/integration-result.json" '.parent_prior_tip' "$T2_HEAD" "L2 parent_prior_tip"
assert_conflict_keys "$FLOW/integration-result.json" "L2"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- LinearizeConflictAborts T3: wrong prereq-refs -> tree_mismatch ----------

setup_fixture_3
printf 'refs/tags/%s\n' "$TAG_D" > "$FLOW/shards/C/prereq-refs"
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "5" "$rc" "L3 exit 5"
assert_json "$FLOW/integration-result.json" '.reason' "tree_mismatch" "L3 reason"
assert_json "$FLOW/integration-result.json" '.offending_shard' "null" "L3 offending_shard"
assert_conflict_keys "$FLOW/integration-result.json" "L3"
assert_json "$FLOW/integration-result.json" '.offending_commit' "null" "L3 offending_commit null"
assert_json "$FLOW/integration-result.json" '.merged_shards | join(",")' "A,C,D" "L3 merged_shards"
head_now=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$BASE_HEAD" "$head_now" "L3 parent HEAD is BASE_HEAD"
assert_no_sequencer "$FLOW/work" "L3"
base=$(basename "$FLOW")
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-integrated"
assert_eq "0" "$?" "L3 integrated branch exists"
cleanup_flow "$REPO" "$FLOW" "$TMP"
