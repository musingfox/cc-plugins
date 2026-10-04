#!/usr/bin/env bash
# Selectively roll back the shards holding the named contracts (design §5).
# Maps each contract to its shard via shards.json, removes the shards'
# worktrees and branches, drops their .checkpoints entries from
# dispatch-state.json, and increments the per-flow rollback_count once.
# Each deleted branch head stays reachable at
# refs/cf-rollback/<flow>/shard-<id>-<rollback_count>, and any
# cf-checkpoint/<flow>/shard-<id>@<sha> tags are kept.
#
# Usage:   cf-pi-rollback.sh FLOW_SESSION CONTRACT [CONTRACT ...]
# Exit:    0 on success, 2 usage, 3 not a git repo, 5 a contract maps to no
#          shard, 6 dispatch-state.json is not a JSON object (nothing changed)
# Output:  one line per shard with outcome, kept ref and retained tag (if any)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -lt 2 ]; then
  echo "Usage: cf-pi-rollback.sh FLOW_SESSION CONTRACT [CONTRACT ...]" >&2
  exit 2
fi

flow_session="$1"; shift
load_cf_flow_env "$flow_session"

# Need REPO_ROOT to run git commands. Source flow env.sh.
if [ ! -f "$flow_session/env.sh" ]; then
  echo "cf-pi-rollback.sh: flow env.sh not found at $flow_session/env.sh" >&2
  exit 2
fi
# shellcheck disable=SC1090,SC1091
. "$flow_session/env.sh"

if [ -z "${REPO_ROOT:-}" ] || [ ! -d "$REPO_ROOT/.git" ] && ! git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "cf-pi-rollback.sh: REPO_ROOT not set or not a git repo ($REPO_ROOT)" >&2
  exit 3
fi

shard_ids=()
for contract in "$@"; do
  sid=$(jq -r --arg c "$contract" '.groups | to_entries[] | select(.value.contracts | index($c)) | .key' "$flow_session/shards.json")
  if [ -z "$sid" ]; then
    echo "cf-pi-rollback.sh: contract $contract maps to no shard in $flow_session/shards.json" >&2
    exit 5
  fi
  shard_ids+=("$sid")
done
ids_json=$(printf '%s\n' "${shard_ids[@]}" | sort -u | jq -R . | jq -s .)

# Build the new state before any destructive step, so a malformed state file
# stops the rollback with every branch still in place.
state=$(cat "$DISPATCH_STATE_FILE" 2>/dev/null || echo '{}')
if ! new_state=$(jq -e --argjson ids "$ids_json" \
  'select(type == "object")
   | .checkpoints_before = (.checkpoints // {})
   | .checkpoints = (.checkpoints_before | with_entries(select(.key as $k | $ids | index($k) | not)))
   | .rollback_count = ((.rollback_count | numbers) // 0) + 1' <<< "$state" 2>/dev/null); then
  echo "cf-pi-rollback.sh: $DISPATCH_STATE_FILE is not a JSON object; nothing rolled back" >&2
  exit 6
fi
cycle=$(jq -r '.rollback_count' <<< "$new_state")
flow_name=$(basename "$flow_session")

rollback_one() {
  local sid="$1"
  local shard_session="$SHARDS_DIR/$sid"

  if [ ! -f "$shard_session/env.sh" ]; then
    echo "shard-$sid: SKIP (no shard env.sh at $shard_session)"
    return 0
  fi

  local sb_slug sb_cf_branch sb_work
  # Read CF_SLUG (fallback SESSION_BASENAME) from shard env without polluting our scope.
  sb_slug=$(grep -E '^CF_SLUG=' "$shard_session/env.sh" | tail -1 | sed 's/^CF_SLUG="\(.*\)"$/\1/')
  [ -z "$sb_slug" ] && sb_slug=$(grep -E '^SESSION_BASENAME=' "$shard_session/env.sh" | head -1 | sed 's/^SESSION_BASENAME="\(.*\)"$/\1/')
  sb_cf_branch="cf/$sb_slug"
  sb_work="$shard_session/work"

  local tag
  tag=$(jq -r --arg k "$sid" '.checkpoints_before[$k] // empty' <<< "$new_state")

  # git lists worktrees by resolved path (/private/tmp on darwin, not /tmp).
  if [ -d "$sb_work" ]; then
    local real_work
    real_work=$(cd "$sb_work" && pwd -P)
    if git -C "$REPO_ROOT" worktree list --porcelain | grep -Fxq "worktree $real_work"; then
      git -C "$REPO_ROOT" worktree remove --force "$real_work" >/dev/null 2>&1 || true
    fi
    rm -rf "$sb_work"
  fi
  git -C "$REPO_ROOT" worktree prune

  local keep=""
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$sb_cf_branch"; then
    # Design §5: never silently waste validated work.
    keep="refs/cf-rollback/$flow_name/shard-$sid-$cycle"
    git -C "$REPO_ROOT" update-ref "$keep" "refs/heads/$sb_cf_branch"
    git -C "$REPO_ROOT" branch -D "$sb_cf_branch" >/dev/null 2>&1 || {
      echo "shard-$sid: WARN failed to delete branch $sb_cf_branch (may still exist)"
    }
  fi

  local msg="shard-$sid: rolled back"
  [ -n "$keep" ] && msg="$msg; head kept at $keep"
  if [ -n "$tag" ]; then
    echo "$msg; retained tag $tag"
  else
    echo "$msg; no checkpoint tag (shard never reached PASS)"
  fi
}

while IFS= read -r sid; do
  rollback_one "$sid"
done < <(jq -r '.[]' <<< "$ids_json")

tmp_state=$(mktemp "$DISPATCH_STATE_FILE.XXXXXX")
jq 'del(.checkpoints_before)' <<< "$new_state" > "$tmp_state"
mv "$tmp_state" "$DISPATCH_STATE_FILE"
