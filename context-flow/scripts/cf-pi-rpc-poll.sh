#!/usr/bin/env bash
# Stateless one-shot poll for RPC-mode pi. Designed to be called from
# the orchestrator via short Bash invocations (timeout: 35000). Each call
# reads disk state and emits one status line, then exits.
#
# Usage:   cf-pi-rpc-poll.sh SESSION
# Statuses (single token prefix; tail is diagnostic):
#   ALIVE          -- pi running, events fresh, no terminal event yet
#   NO_JSONL       -- pi launched, rpc-events.jsonl empty (within 60s grace)
#   NO_JSONL_FAIL  -- events missing past 60s grace; shutdown+escalate
#   DONE           -- agent_end event seen OR pi exited cleanly with events
#   STALL          -- events.jsonl mtime unchanged > $PI_STALL_THRESHOLD_S
#   ERROR          -- "errorMessage" or response.success=false present
#   TIMEOUT        -- elapsed > $PI_WALL_CLOCK_S
#   NO_PID         -- pi.pid missing; dispatch broken

SESSION="$1"
# shellcheck source=/dev/null
. "$SESSION/env.sh"

STALL_THRESHOLD="${PI_STALL_THRESHOLD_S:-180}"
WALL_CLOCK="${PI_WALL_CLOCK_S:-1800}"
PI_PID=$(cat "$SESSION/pi.pid" 2>/dev/null)
START=$(cat "$SESSION/rpc-start.ts" 2>/dev/null)
EVENTS="$SESSION/rpc-events.jsonl"

[ -z "$PI_PID" ] && { echo "NO_PID"; exit 0; }
[ -z "$START" ] && START=$(date +%s)
NOW=$(date +%s); ELAPSED=$((NOW - START))

ALIVE=0
if kill -0 "$PI_PID" 2>/dev/null; then ALIVE=1; fi

# Empty events.jsonl branch (pi hasn't written anything yet).
if [ ! -s "$EVENTS" ]; then
  if [ "$ALIVE" -eq 0 ]; then echo "DONE ${ELAPSED}s no-events"; exit 0; fi
  if [ "$ELAPSED" -gt 60 ]; then echo "NO_JSONL_FAIL ${ELAPSED}s"; exit 0; fi
  echo "NO_JSONL ${ELAPSED}s"; exit 0
fi

# Terminal: provider error (kept in JSONL even in RPC mode).
if grep -q '"errorMessage"' "$EVENTS"; then
  EXCERPT=$(grep -o '"errorMessage":"[^"]\{0,80\}' "$EVENTS" | head -1 | cut -c17-)
  echo "ERROR ${ELAPSED}s pattern=${EXCERPT}"
  exit 0
fi

# Terminal: command-response failure (e.g., prompt rejected).
if grep -q '"type":"response".*"success":false' "$EVENTS"; then
  echo "ERROR ${ELAPSED}s response-success-false"
  exit 0
fi

# Terminal: agent_end means the prompt's turn loop finished — task done.
# Pi remains alive in RPC mode (waiting for next command); orchestrator's
# next action is to shutdown stdin and proceed to report check.
if grep -q '"type":"agent_end"' "$EVENTS"; then
  echo "DONE ${ELAPSED}s agent_end"
  exit 0
fi

MTIME=$(stat -f %m "$EVENTS" 2>/dev/null || stat -c %Y "$EVENTS")
STALE=$((NOW - MTIME))
SZ=$(wc -c < "$EVENTS")

# Process-state checks BEFORE wall-clock / stall -- a pi that already exited
# without firing agent_end is unexpected (likely crashed); treat as DONE and
# let the report check decide if anything usable came out.
if [ "$ALIVE" -eq 0 ]; then echo "DONE ${ELAPSED}s exit-before-end size=${SZ}B"; exit 0; fi
if [ "$ELAPSED" -gt "$WALL_CLOCK" ]; then echo "TIMEOUT ${ELAPSED}s"; exit 0; fi
if [ "$STALE" -gt "$STALL_THRESHOLD" ]; then echo "STALL ${ELAPSED}s stale=${STALE}s"; exit 0; fi

echo "ALIVE ${ELAPSED}s size=${SZ}B stale=${STALE}s"
