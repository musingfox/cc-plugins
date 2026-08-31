#!/usr/bin/env bash
# Gate: actual ⊆ declared file scope for ONE shard.
#
# The only deterministic guard against a builder leaving files in the user's
# project that no contract declared. BOTH implementer paths must run it — the
# OMP path via cf-pi-run.sh step 10, the Claude-fallback path via the /cf
# orchestrator (commands/cf.md §3.6). `git status --porcelain` is NOT a
# substitute: the builder commits with `git add -A`, and porcelain is blind to
# anything already committed.
#
# Usage:   cf-pi-scope.sh SHARD_SESSION
# Stdout:  ALLOWLISTED <csv>   (only when non-empty — benign build/lock touches)
#          UNDECLARED  <csv>   (only when non-empty — scope violation)
# Exit:    0 = clean (allowlisted touches still exit 0)
#          2 = undeclared files present
#          1 = usage / session error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 1 ]; then
  echo "Usage: cf-pi-scope.sh SHARD_SESSION" >&2
  exit 1
fi

SHARD_SESSION="$1"
load_cf_pi_env "$SHARD_SESSION"
if [ -z "${FLOW_SESSION:-}" ] || [ -z "${SHARD_ID:-}" ]; then
  echo "cf-pi-scope: $SHARD_SESSION/env.sh missing FLOW_SESSION or SHARD_ID -- not a sharded session" >&2
  exit 1
fi
load_cf_flow_env "$FLOW_SESSION"

declared_files=$(jq -r --arg sid "$SHARD_ID" '.groups[$sid].files[]' "$SHARDS_FILE" | sort -u)

# Step 1b merged each prerequisite's checkpoint into this worktree, so anything
# reachable from those tags is another shard's work; charging it here fails
# every dependent shard on files it never touched. `--not` excludes exactly the
# refs 1b validated (an empty set is a valid no-op, so no-prereq shards take the
# same path). Merge commits contribute no paths under plain `git log`, so 1b's
# own merge stays invisible.
# Commit union, not net diff, on purpose: the gate asks whether the worker
# touched an undeclared file, not what survived. A file created and deleted
# again still collided with whatever shard actually owns it.
# shellcheck disable=SC2046,SC2086
actual_files=$(git -C "$WORK" log --name-only --pretty=format: "$BASE_HEAD..HEAD" \
                 --not $(cat "$SHARD_SESSION/prereq-refs" 2>/dev/null) 2>/dev/null | sed '/^$/d' | sort -u)

undeclared=""
if [ -n "$actual_files" ]; then
  undeclared=$(comm -23 <(printf '%s\n' "$actual_files") <(printf '%s\n' "$declared_files") || true)
fi

# Build/lock manifests are legitimately touched when the isolated worktree must
# add a missing dev dep to run the tests (e.g. `uv add --dev pytest`). Treat
# them as a warning, not a scope violation.
BUILD_LOCK_ALLOWLIST='^(pyproject\.toml|uv\.lock|requirements[^/]*\.txt|package\.json|package-lock\.json|bun\.lock(b)?|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$'
allowlisted=""
if [ -n "$undeclared" ]; then
  allowlisted=$(printf '%s\n' "$undeclared" | grep -E "$BUILD_LOCK_ALLOWLIST" || true)
  undeclared=$(printf '%s\n' "$undeclared" | grep -vE "$BUILD_LOCK_ALLOWLIST" || true)
fi

csv() { printf '%s' "$1" | tr '\n' ',' | sed 's/,$//'; }

if [ -n "$allowlisted" ]; then echo "ALLOWLISTED $(csv "$allowlisted")"; fi
if [ -n "$undeclared" ]; then
  echo "UNDECLARED $(csv "$undeclared")"
  exit 2
fi
exit 0
