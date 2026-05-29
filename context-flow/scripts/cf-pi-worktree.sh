#!/usr/bin/env bash
# Set up isolated WORK area for the implementer (Pi or Claude implement agent).
# - In a git repo: creates a worktree at $WORK on a fresh branch ($CF_BRANCH)
#   forked from the user's current HEAD ($BASE_BRANCH / $BASE_HEAD).
# - Otherwise:     creates a plain scratch directory at $WORK.
#
# Usage:   cf-pi-worktree.sh SESSION
# Stdout:  WORK path
# Appends REPO_ROOT, BASE_BRANCH, BASE_HEAD to $SESSION/env.sh on first
# invocation (session-wide).
# Appends cleanup commands to $CLEANUP_SCRIPT: capture diff + remove
# worktree. The cf branch is intentionally NOT deleted — it carries
# the per-contract commit history the user keeps.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

# Idempotent: if $WORK already exists and is a registered git worktree (or a
# scratch dir in non-git mode), just emit $WORK and exit. Check on-disk reality
# rather than env.sh contents -- the env-grep proxy false-positives when callers
# (e.g. cf-pi-shard.sh seeding per-shard env) write REPO_ROOT into env.sh as an
# inheritance hint before this script ever runs.
if [ -n "${REPO_ROOT:-}" ]; then
  # Git mode: real check is whether $WORK is a live worktree.
  if [ -d "$WORK" ] && git -C "$WORK" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "$WORK"
    exit 0
  fi
elif [ -d "$WORK" ]; then
  # Scratch mode: dir presence is the only signal.
  echo "$WORK"
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
BASE_BRANCH=""
BASE_HEAD=""

if [ -n "$REPO_ROOT" ]; then
  BASE_BRANCH="$(git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || echo "")"
  BASE_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "")"

  # Fail fast if git identity is unset — per-contract commits would otherwise
  # blow up mid-Phase-3 with the cryptic "Please tell me who you are" error.
  if ! git -C "$REPO_ROOT" config user.email >/dev/null 2>&1 && \
     ! git config --global user.email >/dev/null 2>&1; then
    cat >&2 <<'MSG'
cf-pi-worktree: git user.email is not configured.
Per-contract commits in $WORK will fail. Set identity before re-running /cf:
  git config --global user.email "you@example.com"
  git config --global user.name "Your Name"
(Or set in this repo: drop `--global`.)
MSG
    exit 2
  fi

  git -C "$REPO_ROOT" worktree add -B "$CF_BRANCH" "$WORK" HEAD >&2
  # Diff base is computed at cleanup time as `merge-base cf-tip $BASE_BRANCH`
  # (or fallback to $BASE_HEAD). This way:
  #   - pre-rebase: merge-base = $BASE_HEAD → diff = cf's own commits
  #   - post-rebase: merge-base = current $BASE_BRANCH HEAD → diff still
  #     excludes commits that landed on $BASE_BRANCH during the flow
  # `git diff HEAD` would be empty because HEAD == cf-tip after per-contract
  # commits, so it's never the right capture form.
  diff_base_fallback="${BASE_HEAD:-HEAD}"
  diff_base_branch="${BASE_BRANCH:-}"
  cat >> "$CLEANUP_SCRIPT" <<EOF
git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
_diff_base="$diff_base_fallback"
if [ -n "$diff_base_branch" ]; then
  _mb="\$(git -C "$WORK" merge-base HEAD "$diff_base_branch" 2>/dev/null || true)"
  [ -n "\$_mb" ] && _diff_base="\$_mb"
fi
git -C "$WORK" diff "\$_diff_base" > "$DIFF_FILE" 2>/dev/null || true
git -C "$REPO_ROOT" worktree remove --force "$WORK" 2>/dev/null || true
EOF
else
  mkdir -p "$WORK"
  echo "# scratch mode ($SESSION_BASENAME) -- no cleanup, $WORK retained for inspection" >> "$CLEANUP_SCRIPT"
fi

# Session-wide vars; append once.
if ! grep -q '^REPO_ROOT=' "$session/env.sh" 2>/dev/null; then
  {
    echo "REPO_ROOT=\"$REPO_ROOT\""
    echo "BASE_BRANCH=\"$BASE_BRANCH\""
    echo "BASE_HEAD=\"$BASE_HEAD\""
  } >> "$session/env.sh"
fi

echo "$WORK"
