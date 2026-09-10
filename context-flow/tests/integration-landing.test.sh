#!/usr/bin/env bash
# Linear landing of PASS shards onto the parent cf/<slug> branch.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
INTEGRATE="$SCRIPTS/cf-pi-integrate.sh"

# --- fixture helpers ----------------------------------------------------------

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

parent_log() {
  git -C "$1" log --reverse --pretty=%s "$2"..HEAD
}

# Fixture 1: B then dependent A, both edit lib.txt; A forked from B's tag.
setup_fixture_1() {
  TMP="$(mktemp -d)"
  REPO="$TMP/repo"
  FLOW="$TMP/flow"
  mkdir -p "$REPO" "$FLOW"
  init_repo "$REPO"
  echo base > "$REPO/lib.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm base
  BASE_HEAD=$(git -C "$REPO" rev-parse HEAD)

  write_flow_env "$FLOW" "$REPO" "$BASE_HEAD"
  cat > "$FLOW/shards.json" <<'EOF'
{"schema_version":1,"groups":{
  "A":{"shard_id":"A","contracts":["CA"],"files":["lib.txt"],"depends_on":["B"]},
  "B":{"shard_id":"B","contracts":["CB"],"files":["lib.txt"],"depends_on":[]}
}}
EOF
  write_shard_env "$FLOW" A
  write_shard_env "$FLOW" B

  local base slug
  base=$(basename "$FLOW")
  slug="cf/${base}-shard"

  git -C "$REPO" checkout -qb "${slug}-B"
  echo B > "$REPO/lib.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm B1
  TAG_B=$(tag_and_checkpoint "$REPO" "$FLOW" B)

  git -C "$REPO" checkout -qb "${slug}-A" "$TAG_B"
  echo A > "$REPO/lib.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm A1
  TAG_A=$(tag_and_checkpoint "$REPO" "$FLOW" A)
  git -C "$REPO" checkout -q main

  printf 'refs/tags/%s\n' "$TAG_B" > "$FLOW/shards/A/prereq-refs"

  jq -n --arg a "$TAG_A" --arg b "$TAG_B" \
    '{checkpoints:{A:$a,B:$b}}' > "$FLOW/dispatch-state.json"

  git -C "$REPO" worktree add -b "cf/$base" "$FLOW/work" "$BASE_HEAD" >/dev/null
}

# Fixture 2: independent A (a.txt) and C (c.txt) off base, no prereq-refs.
setup_fixture_2() {
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

  git -C "$REPO" worktree add -b "cf/$base" "$FLOW/work" "$BASE_HEAD" >/dev/null
}

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

# Fixture 5: A and C each add a.txt with identical content.
setup_fixture_5() {
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
  "C":{"shard_id":"C","contracts":["CC"],"files":["a.txt"],"depends_on":[]}
}}
EOF
  write_shard_env "$FLOW" A
  write_shard_env "$FLOW" C

  local base slug
  base=$(basename "$FLOW")
  slug="cf/${base}-shard"

  git -C "$REPO" checkout -qb "${slug}-A"
  echo same > "$REPO/a.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm A1
  TAG_A=$(tag_and_checkpoint "$REPO" "$FLOW" A)

  git -C "$REPO" checkout -q main
  git -C "$REPO" checkout -qb "${slug}-C"
  echo same > "$REPO/a.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm C1
  TAG_C=$(tag_and_checkpoint "$REPO" "$FLOW" C)
  git -C "$REPO" checkout -q main

  jq -n --arg a "$TAG_A" --arg c "$TAG_C" \
    '{checkpoints:{A:$a,C:$c}}' > "$FLOW/dispatch-state.json"

  git -C "$REPO" worktree add -b "cf/$base" "$FLOW/work" "$BASE_HEAD" >/dev/null
}

run_integrate() {
  bash "$INTEGRATE" "$FLOW" true
}

# --- T1 ----------------------------------------------------------------------

setup_fixture_1
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "0" "$rc" "T1 exit 0"
assert_json "$FLOW/integration-result.json" '.status' "PASS" "T1 status PASS"
got_log=$(parent_log "$FLOW/work" "$BASE_HEAD")
assert_eq $'B1\nA1' "$got_log" "T1 parent log B1, A1"
merges=$(git -C "$FLOW/work" rev-list --merges --count "$BASE_HEAD"..HEAD)
assert_eq "0" "$merges" "T1 no merge commits"
base=$(basename "$FLOW")
diff_out=$(git -C "$REPO" diff "refs/heads/cf/${base}-integrated" "refs/heads/cf/${base}" || true)
assert_eq "" "$diff_out" "T1 integrated vs parent empty"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-integrated"
assert_eq "0" "$?" "T1 integrated branch exists"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-shard-A"
assert_eq "0" "$?" "T1 shard A branch exists"
git -C "$REPO" show-ref --verify --quiet "refs/heads/cf/${base}-shard-B"
assert_eq "0" "$?" "T1 shard B branch exists"
git -C "$REPO" rev-parse --verify --quiet "$TAG_A" >/dev/null
assert_eq "0" "$?" "T1 checkpoint A exists"
git -C "$REPO" rev-parse --verify --quiet "$TAG_B" >/dev/null
assert_eq "0" "$?" "T1 checkpoint B exists"
assert_json "$FLOW/integration-result.json" '.parent_prior_tip' "$BASE_HEAD" "T1 parent_prior_tip"
parent_head=$(git -C "$FLOW/work" rev-parse HEAD)
assert_json "$FLOW/integration-result.json" '.parent_tip' "$parent_head" "T1 parent_tip"
assert_json "$FLOW/integration-result.json" '.parent_branch' "cf/${base}" "T1 parent_branch"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- T2 ----------------------------------------------------------------------

setup_fixture_2
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "0" "$rc" "T2 exit 0"
got_log=$(parent_log "$FLOW/work" "$BASE_HEAD")
assert_eq $'A1\nC1' "$got_log" "T2 parent log A1, C1"
merges=$(git -C "$FLOW/work" rev-list --merges --count "$BASE_HEAD"..HEAD)
assert_eq "0" "$merges" "T2 no merge commits"
base=$(basename "$FLOW")
diff_out=$(git -C "$REPO" diff "refs/heads/cf/${base}-integrated" "refs/heads/cf/${base}" || true)
assert_eq "" "$diff_out" "T2 integrated vs parent empty"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- T3 ----------------------------------------------------------------------

setup_fixture_3
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "0" "$rc" "T3 exit 0"
got_log=$(parent_log "$FLOW/work" "$BASE_HEAD")
assert_eq $'A1\nC1\nD1' "$got_log" "T3 parent log A1, C1, D1"
merges=$(git -C "$FLOW/work" rev-list --merges --count "$BASE_HEAD"..HEAD)
assert_eq "0" "$merges" "T3 no merge commits"
base=$(basename "$FLOW")
diff_out=$(git -C "$REPO" diff "refs/heads/cf/${base}-integrated" "refs/heads/cf/${base}" || true)
assert_eq "" "$diff_out" "T3 integrated vs parent empty"
assert_eq '["A","C","D"]' "$(jq -c '.merged_shards' "$FLOW/integration-result.json")" \
  "T3 merged_shards"
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- T4 ----------------------------------------------------------------------

setup_fixture_2
# Recreate env.sh without BASE_HEAD.
base=$(basename "$FLOW")
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="$base"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
REPO_ROOT="$REPO"
BASE_BRANCH="main"
EOF
prior=$(git -C "$FLOW/work" rev-parse HEAD)
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "4" "$rc" "T4 exit 4"
after=$(git -C "$FLOW/work" rev-parse HEAD)
assert_eq "$prior" "$after" "T4 parent HEAD unchanged"
if [ -f "$FLOW/integration-result.json" ]; then
  _assert_fail "T4 landing JSON should not be written"
else
  _assert_pass
fi
cleanup_flow "$REPO" "$FLOW" "$TMP"

# --- T5 ----------------------------------------------------------------------

setup_fixture_5
run_integrate >/dev/null 2>&1
rc=$?
assert_eq "0" "$rc" "T5 exit 0"
assert_json "$FLOW/integration-result.json" '.status' "PASS" "T5 status PASS"
got_log=$(parent_log "$FLOW/work" "$BASE_HEAD")
assert_eq "A1" "$got_log" "T5 parent log A1 only"
count=$(git -C "$FLOW/work" rev-list --count "$BASE_HEAD"..HEAD)
assert_eq "1" "$count" "T5 rev-list count 1"
base=$(basename "$FLOW")
diff_out=$(git -C "$REPO" diff "refs/heads/cf/${base}-integrated" "refs/heads/cf/${base}" || true)
assert_eq "" "$diff_out" "T5 integrated vs parent empty"
cp_head=$(git -C "$FLOW/work" rev-parse --git-path CHERRY_PICK_HEAD)
if [ -e "$cp_head" ]; then
  _assert_fail "T5 CHERRY_PICK_HEAD should be absent"
else
  _assert_pass
fi
cleanup_flow "$REPO" "$FLOW" "$TMP"
