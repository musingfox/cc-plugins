#!/usr/bin/env bash
# Block until a spiral decision brief is written back by the in-browser Save,
# then print the answer frontmatter and exit 0; exit 2 on timeout.
#
# The wake condition is "a Save happened", not "everything was answered": the
# file's mtime changing is the one signal that works for both a single-question
# brief (`choice:` / `notes:`) and a round brief (`q1.choice:` / `q1.notes:`),
# and it still fires for a Save that picked nothing — a 都不對 with reasoning.
# Deciding what an empty answer means belongs to the agent, not the waiter.
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

mtime_of() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null
}

# Every answer line in the frontmatter block: `choice:` / `notes:` and the
# per-question `<id>.choice:` / `<id>.notes:` of a round brief.
answers() {
  sed -n '2,/^---$/p' "$brief" | grep -E '^([A-Za-z0-9_-]+\.)?(choice|notes):'
}

start="$(mtime_of "$brief")"

while [ "$elapsed" -lt "$timeout" ]; do
  now="$(mtime_of "$brief")"
  if [ -n "$now" ] && [ "$now" != "$start" ]; then
    answers || echo "[spiral] saved, but no choice/notes keys in the frontmatter"
    exit 0
  fi
  sleep "$interval"
  elapsed=$((elapsed + interval))
done

echo "[spiral] wait-decision: timeout after ${timeout}s — no Save detected; fall back to terminal." >&2
exit 2
