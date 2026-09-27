#!/usr/bin/env bash
# Ready ONE shard for either builder: worktree + branch, prerequisite
# checkpoints merged, brief assembled. cf-pi-run.sh (OMP path) and the Claude
# fallback (commands/cf.md §3.6) both start here, so a cold-start fallback gets
# the same worktree, BASE_HEAD, prerequisites and brief the gates rely on.
#
# Usage:   cf-pi-prepare.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER
#          Run with cwd inside the host repo: cf-pi-worktree.sh forks from it.
# Stdout:  last line is the verdict
#            PREPARED <brief path>              exit 0
#            FAIL prereq-missing <dep>          exit 1
#            FAIL prereq-merge-conflict <dep>   exit 1
#            FAIL brief-assembly                exit 1
#          A worktree-setup failure exits non-zero with no FAIL line.
# Idempotent: a rerun reuses the worktree, skips prerequisites already merged,
# and rebuilds the brief.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 4 ]; then
  echo "Usage: cf-pi-prepare.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER" >&2
  exit 1
fi

SHARD_SESSION="$1"
GOAL="$2"
CONSTRAINTS="$3"
TEST_RUNNER="$4"

load_cf_pi_env "$SHARD_SESSION"
if [ -z "${FLOW_SESSION:-}" ] || [ -z "${SHARD_ID:-}" ]; then
  echo "cf-pi-prepare: $SHARD_SESSION/env.sh missing FLOW_SESSION or SHARD_ID -- not a sharded session" >&2
  exit 1
fi
load_cf_flow_env "$FLOW_SESSION"

# -------- 1. worktree (MUST run before brief so BASE_HEAD/CF_BRANCH/WORK
#               appear correctly in the brief's Environment block) -----

"$SCRIPTS/cf-pi-worktree.sh" "$SHARD_SESSION" >/dev/null

# Worktree appended REPO_ROOT/BASE_BRANCH/BASE_HEAD to env.sh; re-source.
load_cf_pi_env "$SHARD_SESSION"
load_cf_flow_env "$FLOW_SESSION"

# -------- 2. prerequisite checkpoints ----------------------------------
# A dependent shard forks from the user's HEAD, which lacks its prerequisites'
# interfaces — without this merge the first round burns a guaranteed
# escalation. depends_on comes from shards.json (cf-pi-shard.sh); refs come
# from dispatch-state checkpoints, recorded on PASS. The orchestrator's wave
# rule should never dispatch before prerequisites PASS; a missing checkpoint
# here is therefore an infra FAIL, not a judgement call.
# The manifest is rewritten only when depends_on is non-empty, so a replan that
# drops depends_on would otherwise leave last round's "these files are
# read-only context" block in the brief, steering the worker off files this
# shard now owns.
PREREQ_MANIFEST="$SHARD_SESSION/prereq-merged"
rm -f "$PREREQ_MANIFEST"
# The scope gate subtracts these refs from the shard's own work. Truncated
# unconditionally so a replan that drops depends_on cannot leave last round's
# refs behind and silently exempt files this shard now owns.
PREREQ_REFS="$SHARD_SESSION/prereq-refs"
: > "$PREREQ_REFS"
prereq_deps=$(jq -r --arg sid "$SHARD_ID" '.groups[$sid].depends_on // [] | .[]' "$SHARDS_FILE" 2>/dev/null || true)
if [ -n "$prereq_deps" ] && [ -n "${REPO_ROOT:-}" ]; then
  : > "$PREREQ_MANIFEST.tmp"
  for dep in $prereq_deps; do
    ref=$(jq -r --arg d "$dep" '.checkpoints[$d] // empty' "$DISPATCH_STATE_FILE" 2>/dev/null || true)
    if [ -z "$ref" ] || ! git -C "$WORK" rev-parse --verify --quiet "refs/tags/$ref" >/dev/null; then
      rm -f "$PREREQ_MANIFEST.tmp"
      echo "FAIL prereq-missing $dep"
      exit 1
    fi
    # Idempotent for round-2 reuse of the same worktree.
    if ! git -C "$WORK" merge-base --is-ancestor "refs/tags/$ref" HEAD 2>/dev/null; then
      if ! git -C "$WORK" merge --no-edit "refs/tags/$ref" >/dev/null 2>&1; then
        git -C "$WORK" merge --abort >/dev/null 2>&1 || true
        rm -f "$PREREQ_MANIFEST.tmp"
        echo "FAIL prereq-merge-conflict $dep"
        exit 1
      fi
    fi
    printf 'refs/tags/%s\n' "$ref" >> "$PREREQ_REFS"
    dep_contracts=$(jq -r --arg d "$dep" '.groups[$d].contracts // [] | join(", ")' "$SHARDS_FILE" 2>/dev/null || true)
    printf '%s\t%s\n' "$dep" "$dep_contracts" >> "$PREREQ_MANIFEST.tmp"
  done
  mv "$PREREQ_MANIFEST.tmp" "$PREREQ_MANIFEST"
fi

# -------- 3. brief ------------------------------------------------------

if ! "$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "$GOAL" "$CONSTRAINTS" "$TEST_RUNNER" >/dev/null; then
  echo "FAIL brief-assembly"
  exit 1
fi

echo "PREPARED $BRIEF_FILE"
