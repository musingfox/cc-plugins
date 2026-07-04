#!/usr/bin/env bash
# Set up isolated WORK area for the implementer (OMP or Claude implement agent).
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

  # Human-readable slugs can collide with a prior flow's surviving branch, which
  # still carries unreviewed per-contract commits. Never reset it (-B would):
  # bump to <slug>-2, -3, ... and persist the bumped slug. CF_BRANCH_OWNED marks
  # a branch created by THIS session, so an idempotent re-run may reuse it.
  if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$CF_BRANCH" \
     && ! grep -q '^CF_BRANCH_OWNED=1' "$session/env.sh" 2>/dev/null; then
    _slug="${CF_SLUG:-$SESSION_BASENAME}"; _n=2
    while git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/cf/$_slug-$_n"; do
      _n=$((_n + 1))
    done
    CF_SLUG="$_slug-$_n"
    CF_BRANCH="cf/$CF_SLUG"
    echo "CF_SLUG=\"$CF_SLUG\"" >> "$session/env.sh"
    echo "cf-pi-worktree: branch collision, using $CF_BRANCH" >&2
  fi
  # Mechanism delegated to the canonical primitive (pi-dispatch/pi-worktree.sh):
  # git-identity preflight (DEC-1), worktree add, and the cleanup block
  # (straggler kill-confirm + merge-base diff capture + removal) all live
  # there — cf keeps only its policy: slug-collision bump, CF_BRANCH_OWNED,
  # scratch mode, branch retention. Cleanup diff semantics are identical
  # (merge-base against $BASE_BRANCH, fallback $BASE_HEAD).
  _canon="$(resolve_canon_dispatch)"
  if [ -z "$_canon" ]; then
    echo "cf-pi-worktree: cannot resolve canonical pi-dispatch/scripts dir" >&2
    exit 1
  fi
  "$(dirname "$_canon")/pi-worktree.sh" create \
    --repo_root   "$REPO_ROOT" \
    --branch_name "$CF_BRANCH" \
    --base_ref    "${BASE_HEAD:-HEAD}" \
    --base_branch "${BASE_BRANCH:-${BASE_HEAD:-HEAD}}" \
    --work_path   "$WORK" \
    --diff_out    "$DIFF_FILE" \
    --cleanup_out "$CLEANUP_SCRIPT" \
    --rundir-file "$session/pi-rundir" >/dev/null
  grep -q '^CF_BRANCH_OWNED=1' "$session/env.sh" 2>/dev/null || \
    echo 'CF_BRANCH_OWNED=1' >> "$session/env.sh"
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
