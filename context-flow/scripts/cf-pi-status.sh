#!/usr/bin/env bash
# Operator-facing read-only liveness snapshot across all shards in a flow session.
# Re-derives status from raw disk state every call -- no cache, no coupling to
# cf-pi-poll.sh's lifecycle. Safe to run concurrently with the orchestrator.
#
# Usage:   cf-pi-status.sh FLOW_SESSION
# Stdout:  one line per shard, sorted by shard id, or "no active shards"
#          format: shard-<id> (<g>): <STATUS> <elapsed>s[ jsonl=<size>][ stale=<s>s][ <suffix>]
# Exit:    0 always, unless usage error (2)
# Side:    NONE -- never writes, never modifies state

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 1 ]; then
  echo "Usage: cf-pi-status.sh FLOW_SESSION" >&2
  exit 2
fi

flow_session="$1"
load_cf_flow_env "$flow_session" 2>/dev/null || true

# Path-missing or shards-missing both degrade to "no active shards" (per design).
if [ ! -d "${SHARDS_DIR:-/nonexistent}" ]; then
  echo "no active shards"
  exit 0
fi

shard_dirs=$(find "$SHARDS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
if [ -z "$shard_dirs" ]; then
  echo "no active shards"
  exit 0
fi

STALL_THRESHOLD="${PI_STALL_THRESHOLD_S:-180}"

# Build shard_id -> group_id lookup from shards.json (best-effort).
group_lookup_for() {
  local sid="$1"
  if [ ! -f "$SHARDS_FILE" ]; then echo "g?"; return; fi
  if command -v jq >/dev/null 2>&1; then
    local g
    g=$(jq -r --arg sid "$sid" '.groups | to_entries[] | select(.value.shard_id == $sid or .key == $sid) | .key' "$SHARDS_FILE" 2>/dev/null | head -1)
    [ -n "$g" ] && echo "$g" || echo "g?"
  else
    echo "g?"
  fi
}

format_size() {
  local bytes="$1"
  if [ "$bytes" -lt 1024 ]; then
    echo "${bytes}B"
  else
    awk -v b="$bytes" 'BEGIN { printf "%.1fKB", b/1024 }'
  fi
}

NOW=$(date +%s)

# Latest lifecycle phase, mirrored by cf-pi-run.sh's say() into a 1-line file.
phase_of() {
  local p="$1/progress"
  [ -f "$p" ] && printf ' | %s' "$(head -c 200 "$p" | tr -d '\n')"
}

while IFS= read -r dir; do
  id=$(basename "$dir")
  group=$(group_lookup_for "$id")
  phase=$(phase_of "$dir")
  start_file="$dir/pi-start.ts"
  start=$(cat "$start_file" 2>/dev/null || true)
  [ -z "$start" ] && start=$NOW
  elapsed=$((NOW - start))

  # Resolve the canonical RUNDIR (written by cf-pi-dispatch.sh thin adapter).
  canon_rundir=""
  [ -f "$dir/pi-rundir" ] && canon_rundir="$(cat "$dir/pi-rundir" 2>/dev/null || true)"

  # PID lives in the canonical RUNDIR; fall back to the shard's own pi.pid.
  pid_file="${canon_rundir:+$canon_rundir/pi.pid}"
  [ -z "$pid_file" ] && pid_file="$dir/pi.pid"
  pid=$(cat "$pid_file" 2>/dev/null || true)

  if [ -z "$pid" ]; then
    echo "shard-$id ($group): NO_PID ${elapsed}s$phase"
    continue
  fi

  alive=0
  if kill -0 "$pid" 2>/dev/null; then alive=1; fi

  # JSONL lives in the canonical RUNDIR's sessions/ dir.
  jsonl_dir="${canon_rundir:+$canon_rundir/sessions}"
  [ -z "$jsonl_dir" ] && jsonl_dir="$dir/pi-sessions"
  jsonl=$(ls -t "$jsonl_dir"/*.jsonl 2>/dev/null | head -1 || true)

  if [ -z "$jsonl" ]; then
    if [ "$alive" -eq 0 ]; then
      echo "shard-$id ($group): DONE ${elapsed}s no-jsonl$phase"
    elif [ "$elapsed" -gt 60 ]; then
      echo "shard-$id ($group): NO_JSONL_FAIL ${elapsed}s$phase"
    else
      echo "shard-$id ($group): NO_JSONL ${elapsed}s$phase"
    fi
    continue
  fi

  mtime=$(stat -f %m "$jsonl" 2>/dev/null || stat -c %Y "$jsonl" 2>/dev/null || echo "$NOW")
  stale=$((NOW - mtime))
  sz=$(wc -c < "$jsonl" 2>/dev/null | tr -d ' ' || echo 0)
  sz_fmt=$(format_size "$sz")

  if [ "$alive" -eq 0 ]; then
    echo "shard-$id ($group): DONE ${elapsed}s jsonl=$sz_fmt$phase"
    continue
  fi

  if [ "$stale" -gt "$STALL_THRESHOLD" ]; then
    echo "shard-$id ($group): STALL ${elapsed}s jsonl=$sz_fmt stale=${stale}s$phase"
    continue
  fi

  echo "shard-$id ($group): ALIVE ${elapsed}s jsonl=$sz_fmt stale=${stale}s$phase"
done <<< "$shard_dirs"
