#!/usr/bin/env bash
# cf-pi-record-round.sh
# Records round results for parallel-sharded Pi orchestration.
# Writes $FLOW_SESSION/dispatch-state.json and appends to dispatch-state-archive.jsonl
# Also handles git checkpoint tags for PASS results (CheckpointTagOnPass).
#
# Usage: cf-pi-record-round.sh --round N [--result KEY=VAL ...]
# Exit: 2 on missing --round; 0 otherwise (graceful on non-git)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

round=""
results=()
while [ $# -gt 0 ]; do
  case "$1" in
    --round)
      round="$2"; shift 2 ;;
    --result)
      results+=("$2"); shift 2 ;;
    *)
      echo "cf-pi-record-round.sh: unknown arg $1" >&2; exit 2 ;;
  esac
done

if [ -z "$round" ]; then
  exit 2
fi

if [ -z "${FLOW_SESSION:-}" ]; then
  echo "cf-pi-record-round.sh: FLOW_SESSION not set" >&2
  exit 1
fi

load_cf_flow_env "$FLOW_SESSION"

state_file="$DISPATCH_STATE_FILE"
archive_file="$DISPATCH_ARCHIVE_FILE"

# Load or init state
if [ -f "$state_file" ]; then
  state=$(cat "$state_file")
  prev_round=$(jq -r '.current_round // 0' <<< "$state")
  if [ "$prev_round" -gt 0 ] && [ "$prev_round" -eq "$((round - 1))" ]; then
    # archive prior if advancing
    jq -c --argjson rnd "$prev_round" '. + {round: $rnd}' <<< "$state" >> "$archive_file"
  fi
else
  state='{"results_latest":{},"replan_count":{},"rollback_count":{},"checkpoints":{},"current_round":0}'
fi

# Update results_latest and counts
for res in "${results[@]}"; do
  key="${res%%=*}"
  val="${res#*=}"
  state=$(jq --arg k "$key" --arg v "$val" '.results_latest[$k] = $v' <<< "$state")
  if [ "$val" = "NEEDS_REPLAN" ]; then
    count=$(jq -r --arg k "$key" '.replan_count[$k] // 0' <<< "$state")
    state=$(jq --arg k "$key" --argjson c "$((count + 1))" '.replan_count[$k] = $c' <<< "$state")
  fi
  # rollback_count not incremented here per contracts; assume caller
done

state=$(jq --argjson r "$round" '.current_round = $r' <<< "$state")

echo "$state" > "$state_file"

# Handle checkpoints and git tags for PASS results (CheckpointTagOnPass)
repo_root="${REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || echo '')}"
if [ -n "$repo_root" ] && [ -d "$repo_root/.git" ]; then
  for res in "${results[@]}"; do
    key="${res%%=*}"
    val="${res#*=}"
    if [ "$val" = "PASS" ]; then
      # Determine branch: assume current or ctxflow/*-shard-$key
      branch=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
      if [ -z "$branch" ] || [[ "$branch" != *"shard-$key"* ]]; then
        # try to find
        branch=$(git -C "$repo_root" branch --list "ctxflow/*shard-$key" | head -1 | tr -d ' *' || echo "")
      fi
      if [ -n "$branch" ]; then
        sha=$(git -C "$repo_root" rev-parse "$branch" 2>/dev/null || echo "")
        if [ -n "$sha" ]; then
          tag="cf-checkpoint/$(basename "$FLOW_SESSION")/shard-$key@$sha"
          git -C "$repo_root" tag -f "$tag" "$sha" 2>/dev/null || true
          state=$(jq --arg k "$key" --arg t "$tag" '.checkpoints[$k] = $t' <<< "$state")
          echo "$state" > "$state_file"
        fi
      fi
    fi
  done
fi

# Note: for non-PASS, no tag, and for non-git, graceful (no tag, checkpoints unchanged)
