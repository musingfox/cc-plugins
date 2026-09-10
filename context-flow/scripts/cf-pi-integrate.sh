#!/usr/bin/env bash
# Integration gate: merge all PASS shard branches into cf/<flow-slug>-integrated,
# run the full test suite there, then replay unique shard commits onto the parent
# cf/<flow-slug> worktree as linear history.
#
# Usage:   cf-pi-integrate.sh FLOW_SESSION TEST_RUNNER
# Reads:   $SHARDS_FILE (group -> contracts), $DISPATCH_STATE_FILE (which shards PASS).
# Writes:  $INTEGRATION_RESULT (json), integration branch cf/<flow-slug>-integrated,
#          linearized parent branch cf/<flow-slug> on PASS.
# Exit:    0 PASS, 2 NEEDS_REPLAN (design §5: integration failure injects NEEDS_REPLAN), 3 merge conflict (structurally
#          impossible but guarded), 4 misuse, 5 LINEARIZE_CONFLICT.
# Stdout:  short progress lines + final status word.
#
# Behavior:
#   - Snapshot main cf-branch HEAD as base for the integration branch.
#   - For each PASS shard (from $DISPATCH_STATE_FILE.checkpoints), merge its
#     branch in --no-ff, prerequisite-first. File-graph sharding (design §2) makes
#     physical conflicts structurally impossible -- if any merge produces conflicts, exit 3.
#   - After all merges, run TEST_RUNNER inside the integrated checkout.
#   - If tests pass: linearize unique non-merge commits onto $FLOW_SESSION/work
#     (cf/<slug>) and write INTEGRATION_RESULT with status PASS.
#   - If tests fail: parse the test output for failing test names, attribute each
#     to one or more contracts via the test_files of touches_files in contracts.json,
#     write status NEEDS_REPLAN with affected_contracts list and exit 2.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 2 ]; then
  echo "Usage: cf-pi-integrate.sh FLOW_SESSION TEST_RUNNER" >&2
  exit 4
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "cf-pi-integrate.sh: jq is required" >&2
  exit 4
fi

flow_session="$1"; test_runner="$2"
load_cf_flow_env "$flow_session"

if [ ! -f "$flow_session/env.sh" ]; then
  echo "cf-pi-integrate.sh: flow env.sh not found at $flow_session/env.sh" >&2
  exit 4
fi
# shellcheck disable=SC1090,SC1091
. "$flow_session/env.sh"

if [ -z "${REPO_ROOT:-}" ]; then
  echo "cf-pi-integrate.sh: REPO_ROOT not set in flow env" >&2
  exit 4
fi
if [ -z "${BASE_HEAD:-}" ]; then
  echo "cf-pi-integrate.sh: BASE_HEAD not set in flow env" >&2
  exit 4
fi
if [ ! -f "$DISPATCH_STATE_FILE" ]; then
  echo "cf-pi-integrate.sh: dispatch state not found at $DISPATCH_STATE_FILE" >&2
  exit 4
fi

# Top-K failure cap (design §7 token discipline).
TOP_K_FAILURES="${PI_INTEGRATE_TOP_K:-10}"

# Determine which shards passed and need merging.
shard_ids=$(jq -r '.checkpoints // {} | keys[]' "$DISPATCH_STATE_FILE" 2>/dev/null || true)
if [ -z "$shard_ids" ]; then
  echo "no PASS shards in dispatch state; integration is a no-op" >&2
  jq -n --arg ts "$(date +%s)" '{schema_version: 1, status: "PASS", timestamp: ($ts|tonumber), reason: "no-shards-to-integrate", merged_shards: [], failures: []}' > "$INTEGRATION_RESULT"
  echo "PASS"
  exit 0
fi

flow_basename=$(basename "$flow_session")
flow_slug="${CF_SLUG:-$flow_basename}"
# Sibling naming, NOT "cf/$flow_slug/integrated": shard branches live at
# cf/$flow_slug*, and git refs cannot have cf/X as both file and dir.
integration_branch="cf/$flow_slug-integrated"
integration_work="$flow_session/integrated-work"
parent_work="$flow_session/work"
parent_branch="cf/$flow_slug"

# Snapshot base = the BASE_HEAD captured at flow start.
base_commit="$BASE_HEAD"

shard_branch_name() {
  local sid="$1" shard_env sb_slug
  shard_env="$SHARDS_DIR/$sid/env.sh"
  [ -f "$shard_env" ] || return 1
  sb_slug=$(grep -E '^CF_SLUG=' "$shard_env" | tail -1 | sed 's/^CF_SLUG="\(.*\)"$/\1/')
  [ -z "$sb_slug" ] && sb_slug=$(grep -E '^SESSION_BASENAME=' "$shard_env" | head -1 | sed 's/^SESSION_BASENAME="\(.*\)"$/\1/')
  [ -n "$sb_slug" ] || return 1
  echo "cf/$sb_slug"
}

# Prerequisite-first order among checkpoint shards. Echoes ids; returns 1 on cycle.
topo_order_shards() {
  local remaining sid dep blocked progressed next_remaining ordered=""
  remaining=$(printf '%s\n' $shard_ids | sort)
  local guard=0
  while [ -n "$remaining" ]; do
    guard=$((guard + 1))
    [ "$guard" -gt 64 ] && return 1
    progressed=""
    next_remaining=""
    while IFS= read -r sid; do
      [ -z "$sid" ] && continue
      blocked=0
      for dep in $(jq -r --arg sid "$sid" '.groups[$sid].depends_on // [] | .[]' "$SHARDS_FILE" 2>/dev/null); do
        printf '%s\n' "$remaining" | grep -qx "$dep" || continue
        blocked=1
        break
      done
      if [ "$blocked" -eq 0 ]; then
        ordered="${ordered}${sid}"$'\n'
        progressed=1
      else
        next_remaining="${next_remaining}${sid}"$'\n'
      fi
    done <<< "$remaining"
    [ -n "$progressed" ] || return 1
    remaining=$(printf '%s' "$next_remaining" | sed '/^$/d')
  done
  printf '%s' "$ordered" | sed '/^$/d'
}

unique_shard_commits() {
  local sid="$1" branch="$2"
  local -a not_args=()
  local ref dep tag
  if [ -s "$SHARDS_DIR/$sid/prereq-refs" ]; then
    while IFS= read -r ref; do
      [ -n "$ref" ] && not_args+=("$ref")
    done < "$SHARDS_DIR/$sid/prereq-refs"
  else
    for dep in $(jq -r --arg sid "$sid" '.groups[$sid].depends_on // [] | .[]' "$SHARDS_FILE" 2>/dev/null); do
      tag=$(jq -r --arg d "$dep" '.checkpoints[$d] // empty' "$DISPATCH_STATE_FILE")
      [ -n "$tag" ] && not_args+=("$tag")
    done
  fi
  if [ ${#not_args[@]} -gt 0 ]; then
    git -C "$REPO_ROOT" rev-list --reverse --no-merges "$base_commit..$branch" --not "${not_args[@]}"
  else
    git -C "$REPO_ROOT" rev-list --reverse --no-merges "$base_commit..$branch"
  fi
}

clear_sequencer() {
  local wt="$1"
  local head_path seq_path
  head_path=$(git -C "$wt" rev-parse --git-path CHERRY_PICK_HEAD 2>/dev/null || true)
  seq_path=$(git -C "$wt" rev-parse --git-path sequencer 2>/dev/null || true)
  [ -n "$head_path" ] && rm -f "$head_path"
  [ -n "$seq_path" ] && rm -rf "$seq_path"
}

# Clean any prior integration worktree (idempotent retry).
if git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | grep -Fq "worktree $integration_work"; then
  git -C "$REPO_ROOT" worktree remove --force "$integration_work" >/dev/null 2>&1 || true
fi
if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$integration_branch"; then
  git -C "$REPO_ROOT" branch -D "$integration_branch" >/dev/null 2>&1 || true
fi
rm -rf "$integration_work"

# Create integration worktree.
git -C "$REPO_ROOT" worktree add -b "$integration_branch" "$integration_work" "$base_commit" >/dev/null
echo "integration worktree: $integration_work (base $base_commit, branch $integration_branch)"

have_cycle=0
if ! merge_order=$(topo_order_shards); then
  have_cycle=1
  merge_order=$(printf '%s\n' $shard_ids)
fi

merged_shards=()
for sid in $merge_order; do
  if ! shard_branch=$(shard_branch_name "$sid"); then
    echo "shard-$sid: SKIP (no shard env)"
    continue
  fi
  if ! git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$shard_branch"; then
    echo "shard-$sid: SKIP (branch $shard_branch missing)"
    continue
  fi

  echo "merging shard-$sid ($shard_branch) ..."
  if ! git -C "$integration_work" merge --no-ff --no-edit "$shard_branch" >/dev/null 2>&1; then
    git -C "$integration_work" merge --abort >/dev/null 2>&1 || true
    echo "shard-$sid: MERGE CONFLICT (structurally unexpected -- check touches_files declarations)"
    jq -n \
      --arg ts "$(date +%s)" \
      --arg sid "$sid" \
      --arg branch "$shard_branch" \
      '{schema_version: 1, status: "FAIL", timestamp: ($ts|tonumber), reason: "merge_conflict", offending_shard: $sid, offending_branch: $branch}' \
      > "$INTEGRATION_RESULT"
    exit 3
  fi
  merged_shards+=("$sid")
done

echo "merged: ${merged_shards[*]:-(none)}"
echo "running integration tests: $test_runner"

# Run tests. Capture output bounded.
test_log="$flow_session/integration-test.log"
set +e
( cd "$integration_work" && eval "$test_runner" ) > "$test_log" 2>&1
test_exit=$?
set -e

if [ "$test_exit" -ne 0 ]; then
  # Test failures. Extract up to TOP_K and attribute to contracts.
  echo "integration tests FAIL (exit=$test_exit); attributing to contracts"

  failures_raw=$(grep -E '^(not ok |FAIL |  ✗ |  ● |# fail |Error: )' "$test_log" 2>/dev/null | head -n "$TOP_K_FAILURES")

  attribution_json=$(jq -n --arg raw "$failures_raw" --slurpfile contracts "$CONTRACTS_FILE" '
    ($raw | split("\n") | map(select(length > 0))) as $lines
    | $contracts[0].contracts as $cs
    | $lines | map(
        . as $line
        | {
            failure: $line,
            contracts: [
              $cs[] |
              select(
                (.touches_files // []) | any(. as $f | $line | contains($f))
              ) | .name
            ]
          }
      )
  ')

  affected_contracts=$(echo "$attribution_json" | jq -r 'map(.contracts) | add // [] | unique')

  jq -n \
    --arg ts "$(date +%s)" \
    --arg branch "$integration_branch" \
    --argjson shards "$(printf '%s\n' "${merged_shards[@]}" | jq -R . | jq -s .)" \
    --argjson failures "$attribution_json" \
    --argjson affected "$affected_contracts" \
    --arg log "$test_log" \
    '{
      schema_version: 1,
      status: "NEEDS_REPLAN",
      timestamp: ($ts|tonumber),
      integration_branch: $branch,
      merged_shards: $shards,
      reason: "integration_test_fail",
      failures: $failures,
      affected_contracts: $affected,
      test_log: $log
    }' > "$INTEGRATION_RESULT"

  echo "NEEDS_REPLAN ($(echo "$affected_contracts" | jq -r 'length') contract(s) affected)"
  exit 2
fi

echo "integration tests PASS"

if [ ! -d "$parent_work" ] || ! git -C "$parent_work" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "LINEARIZE_CONFLICT parent_missing"
  jq -n \
    --arg ts "$(date +%s)" \
    --arg branch "$integration_branch" \
    '{schema_version: 1, status: "LINEARIZE_CONFLICT", timestamp: ($ts|tonumber), reason: "parent_missing", integration_branch: $branch, parent_prior_tip: null}' \
    > "$INTEGRATION_RESULT"
  echo "LINEARIZE_CONFLICT"
  exit 5
fi

parent_prior_tip=$(git -C "$parent_work" rev-parse HEAD)

if [ -n "$(git -C "$parent_work" status --porcelain)" ]; then
  echo "LINEARIZE_CONFLICT parent_dirty"
  jq -n \
    --arg ts "$(date +%s)" \
    --arg branch "$integration_branch" \
    --arg prior "$parent_prior_tip" \
    '{schema_version: 1, status: "LINEARIZE_CONFLICT", timestamp: ($ts|tonumber), reason: "parent_dirty", integration_branch: $branch, parent_prior_tip: $prior}' \
    > "$INTEGRATION_RESULT"
  echo "LINEARIZE_CONFLICT"
  exit 5
fi

if [ "$have_cycle" -eq 1 ]; then
  echo "LINEARIZE_CONFLICT dependency_cycle"
  jq -n \
    --arg ts "$(date +%s)" \
    --arg branch "$integration_branch" \
    --arg prior "$parent_prior_tip" \
    '{schema_version: 1, status: "LINEARIZE_CONFLICT", timestamp: ($ts|tonumber), reason: "dependency_cycle", integration_branch: $branch, parent_prior_tip: $prior}' \
    > "$INTEGRATION_RESULT"
  echo "LINEARIZE_CONFLICT"
  exit 5
fi

git -C "$parent_work" reset --hard "$base_commit" >/dev/null

for sid in "${merged_shards[@]}"; do
  shard_branch=$(shard_branch_name "$sid") || continue
  while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    set +e
    git -C "$parent_work" cherry-pick --empty=drop "$sha" >/dev/null 2>&1
    pick_rc=$?
    set -e
    if [ "$pick_rc" -ne 0 ]; then
      # Identical patch already on the tree: drop it and continue.
      if git -C "$parent_work" diff --quiet && git -C "$parent_work" diff --cached --quiet; then
        git -C "$parent_work" cherry-pick --skip >/dev/null 2>&1 || true
        clear_sequencer "$parent_work"
        git -C "$parent_work" reset --hard HEAD >/dev/null
        continue
      fi
      git -C "$parent_work" cherry-pick --abort >/dev/null 2>&1 || true
      clear_sequencer "$parent_work"
      git -C "$parent_work" reset --hard "$parent_prior_tip" >/dev/null
      echo "LINEARIZE_CONFLICT cherry_pick_conflict (shard $sid)"
      jq -n \
        --arg ts "$(date +%s)" \
        --arg sid "$sid" \
        --arg branch "$integration_branch" \
        --arg prior "$parent_prior_tip" \
        '{schema_version: 1, status: "LINEARIZE_CONFLICT", timestamp: ($ts|tonumber), reason: "cherry_pick_conflict", offending_shard: $sid, integration_branch: $branch, parent_prior_tip: $prior}' \
        > "$INTEGRATION_RESULT"
      echo "LINEARIZE_CONFLICT"
      exit 5
    fi
  done < <(unique_shard_commits "$sid" "$shard_branch")
done

if ! git -C "$REPO_ROOT" diff --quiet "refs/heads/$integration_branch" "refs/heads/$parent_branch"; then
  git -C "$parent_work" reset --hard "$parent_prior_tip" >/dev/null
  echo "LINEARIZE_CONFLICT tree_mismatch"
  jq -n \
    --arg ts "$(date +%s)" \
    --arg branch "$integration_branch" \
    --arg prior "$parent_prior_tip" \
    '{schema_version: 1, status: "LINEARIZE_CONFLICT", timestamp: ($ts|tonumber), reason: "tree_mismatch", offending_shard: null, integration_branch: $branch, parent_prior_tip: $prior}' \
    > "$INTEGRATION_RESULT"
  echo "LINEARIZE_CONFLICT"
  exit 5
fi

parent_tip=$(git -C "$parent_work" rev-parse HEAD)
jq -n \
  --arg ts "$(date +%s)" \
  --arg branch "$integration_branch" \
  --argjson shards "$(printf '%s\n' "${merged_shards[@]}" | jq -R . | jq -s .)" \
  --arg prior "$parent_prior_tip" \
  --arg tip "$parent_tip" \
  --arg pbranch "$parent_branch" \
  '{schema_version: 1, status: "PASS", timestamp: ($ts|tonumber), integration_branch: $branch, merged_shards: $shards, failures: [], parent_prior_tip: $prior, parent_tip: $tip, parent_branch: $pbranch}' \
  > "$INTEGRATION_RESULT"
echo "PASS"
exit 0
