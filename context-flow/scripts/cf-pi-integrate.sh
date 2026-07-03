#!/usr/bin/env bash
# Integration gate: merge all PASS shard branches into cf/<flow-slug>-integrated,
# run the full test suite there, classify outcome.
#
# Usage:   cf-pi-integrate.sh FLOW_SESSION TEST_RUNNER
# Reads:   $SHARDS_FILE (group -> contracts), $DISPATCH_STATE_FILE (which shards PASS).
# Writes:  $INTEGRATION_RESULT (json), integration branch cf/<flow-slug>-integrated.
# Exit:    0 PASS, 2 NEEDS_REPLAN (design §5: integration failure injects NEEDS_REPLAN), 3 merge conflict (structurally
#          impossible but guarded), 4 misuse.
# Stdout:  short progress lines + final status word.
#
# Behavior:
#   - Snapshot main cf-branch HEAD as base for the integration branch.
#   - For each PASS shard (from $DISPATCH_STATE_FILE.checkpoints), merge its
#     branch in --no-ff. File-graph sharding (design §2) makes physical conflicts
#     structurally impossible -- if any merge produces conflicts, exit 3.
#   - After all merges, run TEST_RUNNER inside the integrated checkout.
#   - If tests pass: write INTEGRATION_RESULT with status PASS.
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

# Snapshot base = the BASE_HEAD captured at flow start.
base_commit="${BASE_HEAD:-HEAD}"

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

merged_shards=()
for sid in $shard_ids; do
  # Derive shard branch name from shard env.sh.
  shard_env="$SHARDS_DIR/$sid/env.sh"
  if [ ! -f "$shard_env" ]; then
    echo "shard-$sid: SKIP (no shard env)"
    continue
  fi
  sb_slug=$(grep -E '^CF_SLUG=' "$shard_env" | tail -1 | sed 's/^CF_SLUG="\(.*\)"$/\1/')
  [ -z "$sb_slug" ] && sb_slug=$(grep -E '^SESSION_BASENAME=' "$shard_env" | head -1 | sed 's/^SESSION_BASENAME="\(.*\)"$/\1/')
  shard_branch="cf/$sb_slug"
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

if [ "$test_exit" -eq 0 ]; then
  echo "integration tests PASS"
  jq -n \
    --arg ts "$(date +%s)" \
    --arg branch "$integration_branch" \
    --argjson shards "$(printf '%s\n' "${merged_shards[@]}" | jq -R . | jq -s .)" \
    '{schema_version: 1, status: "PASS", timestamp: ($ts|tonumber), integration_branch: $branch, merged_shards: $shards, failures: []}' \
    > "$INTEGRATION_RESULT"
  echo "PASS"
  exit 0
fi

# Test failures. Extract up to TOP_K and attribute to contracts.
echo "integration tests FAIL (exit=$test_exit); attributing to contracts"

# Heuristic: pull lines that look like test failures. Captures node:test, vitest,
# jest formats. Cap at TOP_K_FAILURES lines.
failures_raw=$(grep -E '^(not ok |FAIL |  ✗ |  ● |# fail |Error: )' "$test_log" 2>/dev/null | head -n "$TOP_K_FAILURES")

# Build attribution: for each failing test line, find which contract's touches_files
# contains a substring of the failure (best-effort).
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
