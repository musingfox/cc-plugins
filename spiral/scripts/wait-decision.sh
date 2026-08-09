#!/usr/bin/env bash
# Block until a spiral decision brief's `choice:` OR `notes:` frontmatter is
# filled by the in-browser Save, then print both and exit 0; exit 2 on timeout.
# Watching `notes:` too is what makes a Save with no option picked — a 都不對
# with reasoning — resume the turn instead of polling to timeout.
#
# Run this with the Bash tool's run_in_background — when it exits, the harness
# re-invokes the agent. That makes the human's browser Save the ONLY action
# needed to resume the turn: no return-to-terminal keypress. To answer in the
# terminal instead, the human Ctrl-C's this waiter and the agent takes over.
#
# Usage: wait-decision.sh <brief.md> [timeout_sec]

brief="${1:?usage: wait-decision.sh <brief.md> [timeout_sec]}"
timeout="${2:-1800}"   # 30 min: long enough to deliberate, bounded so it can't zombie
interval=2
elapsed=0

if [ ! -f "$brief" ]; then
  echo "[spiral] wait-decision: brief not found: $brief" >&2
  exit 1
fi

field() {
  grep -m1 "^$1:" "$brief" 2>/dev/null \
    | sed "s/^$1:[[:space:]]*//" \
    | sed 's/[[:space:]]*$//'
}

while [ "$elapsed" -lt "$timeout" ]; do
  choice="$(field choice)"
  notes="$(field notes)"
  if [ -n "$choice" ] || [ -n "$notes" ]; then
    echo "choice: $choice"
    echo "notes: $notes"
    exit 0
  fi
  sleep "$interval"
  elapsed=$((elapsed + interval))
done

echo "[spiral] wait-decision: timeout after ${timeout}s — no Save detected; fall back to terminal." >&2
exit 2
