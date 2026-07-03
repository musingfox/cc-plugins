#!/usr/bin/env bash
# Selectively roll back shard branches (design §3 recoverability ladder).
# Removes the worktrees and force-deletes the branches; preserves any
# cf-checkpoint/<flow>/shard-<id>@<sha> tags so the work remains retrievable.
#
# Usage:   cf-pi-rollback.sh FLOW_SESSION SHARD_ID [SHARD_ID ...]
# Exit:    0 on success, 2 usage, 3 not a git repo
# Output:  one line per shard with outcome + retained tag (if any)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -lt 2 ]; then
  echo "Usage: cf-pi-rollback.sh FLOW_SESSION SHARD_ID [SHARD_ID ...]" >&2
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

rollback_one() {
  local sid="$1"
  local shard_session="$SHARDS_DIR/$sid"

  # Derive shard branch via same convention as cf-pi-env.sh (load on shard).
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

  # Look for any cf-checkpoint tag pointing to this branch (best-effort).
  local tag
  tag=$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' "refs/tags/cf-checkpoint/*shard-$sid*" 2>/dev/null | head -1)

  # Remove worktree if present.
  if git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null | grep -Fq "worktree $sb_work"; then
    git -C "$REPO_ROOT" worktree remove --force "$sb_work" >/dev/null 2>&1 || true
  elif [ -d "$sb_work" ]; then
    # Stale worktree not registered -- clean up dir.
    rm -rf "$sb_work" || true
  fi

  # Force-delete the branch if it exists.
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$sb_cf_branch"; then
    git -C "$REPO_ROOT" branch -D "$sb_cf_branch" >/dev/null 2>&1 || {
      echo "shard-$sid: WARN failed to delete branch $sb_cf_branch (may still exist)"
    }
  fi

  if [ -n "$tag" ]; then
    echo "shard-$sid: rolled back; retained tag $tag"
  else
    echo "shard-$sid: rolled back; no checkpoint tag (shard never reached PASS)"
  fi
}

for sid in "$@"; do
  rollback_one "$sid"
done
