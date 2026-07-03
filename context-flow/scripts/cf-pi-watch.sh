#!/usr/bin/env bash
# Monitor-companion for Phase 3: emits ONE line per meaningful change across
# all shards, and exits when every shard has written its outcome.md.
#
# Designed for the Claude Code Monitor tool ("one event per occurrence, until
# a known end"): each stdout line becomes a chat notification, so the
# orchestrator and the human see progress mid-run without polling.
#
# Usage:   cf-pi-watch.sh FLOW_SESSION [INTERVAL_S]   (default 30)
# Stdout:  one line per change: lifecycle-phase transitions, liveness
#          transitions (ALIVE/STALL/...), and per-shard final outcomes with
#          Status/Reason/Cause. Round counters / byte counts / elapsed jitter
#          are normalized away so they never emit.
# Exit:    0 when all shards have outcomes; 1 on setup error.

set -uo pipefail   # no -e: a transient read failure must not kill the watch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -lt 1 ]; then
  echo "Usage: cf-pi-watch.sh FLOW_SESSION [INTERVAL_S]" >&2
  exit 1
fi
flow_session="$1"
interval="${2:-30}"
load_cf_flow_env "$flow_session" || exit 1

# Fan-out must have happened; give shards.json a short grace window.
waited=0
while [ ! -f "$SHARDS_FILE" ]; do
  [ "$waited" -ge 60 ] && { echo "watch: no shards.json after 60s — nothing to watch"; exit 1; }
  sleep 5; waited=$((waited + 5))
done

shard_ids=$(jq -r '.groups | keys[]' "$SHARDS_FILE" 2>/dev/null | sort)
[ -z "$shard_ids" ] && { echo "watch: shards.json has no groups"; exit 1; }

outcome_line() {  # $1 = shard id -> final one-liner from outcome.md
  local o="$SHARDS_DIR/$1/outcome.md"
  local st rs cz
  st=$(sed -n '/^## Status/{n;p;q;}' "$o" 2>/dev/null)
  rs=$(sed -n '/^## Reason/{n;p;q;}' "$o" 2>/dev/null)
  cz=$(sed -n '/^## Cause/{n;p;q;}' "$o" 2>/dev/null)
  [ "$cz" = "-" ] && cz=""
  printf 'shard-%s: %s (%s)%s\n' "$1" "${st:-?}" "${rs:-?}" "${cz:+ — $cz}"
}

all_done() {
  local id
  for id in $shard_ids; do
    [ -s "$SHARDS_DIR/$id/outcome.md" ] || return 1
  done
  return 0
}

# Normalize a status line so only MEANINGFUL changes differ: drop elapsed,
# sizes, staleness, timestamps, and poll-round counters.
normalize() {
  sed -E 's/ [0-9]+s//g; s/ jsonl=[^ ]+//; s/ stale=[0-9]+s//; s/\| [0-9:]{7,8} /| /; s/round [0-9]+\/[0-9]+/round/g'
}

prev_file=$(mktemp)
trap 'rm -f "$prev_file"' EXIT

first=1
while :; do
  raw=$("$SCRIPT_DIR/cf-pi-status.sh" "$flow_session" 2>/dev/null || true)
  # Emit raw lines whose normalized form wasn't in the previous snapshot.
  cur_file=$(mktemp)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    norm=$(printf '%s\n' "$line" | normalize)
    printf '%s\n' "$norm" >> "$cur_file"
    if [ "$first" -eq 1 ] || ! grep -Fxq "$norm" "$prev_file"; then
      printf '%s\n' "$line"
    fi
  done <<< "$raw"
  mv "$cur_file" "$prev_file"
  first=0

  if all_done; then
    echo "--- all shards done ---"
    for id in $shard_ids; do outcome_line "$id"; done
    exit 0
  fi
  sleep "$interval"
done
