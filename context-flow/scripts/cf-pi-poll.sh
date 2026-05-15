#!/usr/bin/env bash
# Stateless one-shot poll. Emits exactly one status line, then exits.
# Designed to be called once per ~30s round from the orchestrator via short Bash
# tool invocations (timeout: 35000). Each call reads state from disk so a failed
# poll != Pi failure -- just re-poll.
#
# Usage:   cf-pi-poll.sh SESSION
# Statuses (single token prefix; tail is diagnostic):
#   ALIVE          -- Pi running, JSONL fresh; continue
#   NO_JSONL       -- Pi launched, JSONL not produced yet (within 60s grace); continue
#   NO_JSONL_FAIL  -- JSONL missing past 60s grace; kill+escalate
#   DONE           -- kill -0 failed; Pi exited cleanly; proceed to report check
#   STALL          -- JSONL mtime unchanged > $PI_STALL_THRESHOLD_S; kill+escalate
#   ERROR          -- "errorMessage" present in JSONL; kill+classify+escalate
#   TIMEOUT        -- elapsed > $PI_WALL_CLOCK_S; kill+escalate
#   NO_PID         -- pi.pid missing; dispatch broken; abort

SESSION="$1"
# shellcheck source=/dev/null
. "$SESSION/env.sh"

STALL_THRESHOLD="${PI_STALL_THRESHOLD_S:-180}"
WALL_CLOCK="${PI_WALL_CLOCK_S:-1800}"
PI_PID=$(cat "$SESSION/pi.pid" 2>/dev/null)
START=$(cat "$SESSION/pi-start.ts" 2>/dev/null)
[ -z "$PI_PID" ] && { echo "NO_PID"; exit 0; }
[ -z "$START" ] && START=$(date +%s)
NOW=$(date +%s); ELAPSED=$((NOW - START))

ALIVE=0
if kill -0 "$PI_PID" 2>/dev/null; then ALIVE=1; fi

JSONL=$(ls -t "$SESSION/pi-sessions"/*.jsonl 2>/dev/null | head -1)

if [ -z "$JSONL" ]; then
  if [ "$ALIVE" -eq 0 ]; then echo "DONE ${ELAPSED}s no-jsonl"; exit 0; fi
  if [ "$ELAPSED" -gt 60 ]; then echo "NO_JSONL_FAIL ${ELAPSED}s"; exit 0; fi
  echo "NO_JSONL ${ELAPSED}s"; exit 0
fi

if grep -q '"errorMessage"' "$JSONL"; then
  EXCERPT=$(grep -o '"errorMessage":"[^"]\{0,80\}' "$JSONL" | head -1 | cut -c17-)
  echo "ERROR ${ELAPSED}s pattern=${EXCERPT}"
  exit 0
fi

MTIME=$(stat -f %m "$JSONL" 2>/dev/null || stat -c %Y "$JSONL")
STALE=$((NOW - MTIME))
SZ=$(wc -c < "$JSONL")

# Process-state checks BEFORE wall-clock / stall -- a Pi that already exited is
# DONE regardless of how long it took or how stale the JSONL looks.
if [ "$ALIVE" -eq 0 ]; then echo "DONE ${ELAPSED}s jsonl=${SZ}B"; exit 0; fi
if [ "$ELAPSED" -gt "$WALL_CLOCK" ]; then echo "TIMEOUT ${ELAPSED}s"; exit 0; fi
if [ "$STALE" -gt "$STALL_THRESHOLD" ]; then echo "STALL ${ELAPSED}s stale=${STALE}s"; exit 0; fi

echo "ALIVE ${ELAPSED}s jsonl=${SZ}B stale=${STALE}s"
