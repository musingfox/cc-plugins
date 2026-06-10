#!/usr/bin/env bash
# Stateless one-shot poll over Pi's json-mode event stream ($PI_STDOUT).
# Emits exactly one status line, then exits. Each call reads state from disk,
# so a failed poll != Pi failure -- just re-poll.
#
# Completion and errors are read from the stream's terminal `agent_end` event
# (stopReason), NOT inferred from process death + report existence. Liveness is
# event arrival (stream mtime), state-aware: a stream whose last event is
# tool_execution_start is legitimately quiet while the tool runs, so the stall
# threshold doubles there.
#
# Usage:   cf-pi-poll.sh SESSION
# Statuses (single token prefix; tail is diagnostic):
#   ALIVE          -- Pi running, events arriving (or inside a tool call); continue
#   NO_JSONL       -- Pi launched, no events yet (within 60s grace); continue
#   NO_JSONL_FAIL  -- no events past 60s grace, or process died with none; kill+escalate
#   DONE           -- agent_end with stopReason "stop"; proceed to report check
#   STALL          -- no event past threshold (2x inside a tool call); kill+escalate
#   ERROR          -- agent_end with error/aborted stopReason, or process died mid-stream
#   TIMEOUT        -- elapsed > $PI_WALL_CLOCK_S; kill+escalate
#   NO_PID         -- pi.pid missing; dispatch broken; abort

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

SESSION="$1"
load_cf_pi_env "$SESSION" || { echo "NO_PID"; exit 0; }

STALL_THRESHOLD="${PI_STALL_THRESHOLD_S:-180}"
WALL_CLOCK="${PI_WALL_CLOCK_S:-1800}"
PI_PID=$(cat "$PI_PID_FILE" 2>/dev/null)
START=$(cat "$PI_START_FILE" 2>/dev/null)
[ -z "$PI_PID" ] && { echo "NO_PID"; exit 0; }
[ -z "$START" ] && START=$(date +%s)
NOW=$(date +%s); ELAPSED=$((NOW - START))

ALIVE=0
if kill -0 "$PI_PID" 2>/dev/null; then ALIVE=1; fi

EVENTS="$PI_STDOUT"

# --- no events yet -------------------------------------------------------
if [ ! -s "$EVENTS" ]; then
  if [ "$ALIVE" -eq 0 ]; then echo "NO_JSONL_FAIL ${ELAPSED}s died-no-events"; exit 0; fi
  if [ "$ELAPSED" -gt 60 ]; then echo "NO_JSONL_FAIL ${ELAPSED}s"; exit 0; fi
  echo "NO_JSONL ${ELAPSED}s"; exit 0
fi

SZ=$(wc -c < "$EVENTS")

# --- terminal event ------------------------------------------------------
# agent_end is the protocol's terminal event; once present, the run's outcome
# is decided regardless of whether the process has finished flushing.
AGENT_END=$(grep '"type":"agent_end"' "$EVENTS" | tail -1)
if [ -n "$AGENT_END" ]; then
  STOP_REASON=$(printf '%s' "$AGENT_END" | jq -r '.messages[-1].stopReason // "unknown"' 2>/dev/null || echo unparseable)
  if [ "$STOP_REASON" = "stop" ]; then
    echo "DONE ${ELAPSED}s events=${SZ}B"
    exit 0
  fi
  EXCERPT=$(printf '%s' "$AGENT_END" | jq -r '.messages[-1].errorMessage // ""' 2>/dev/null | head -c 120 | tr '\n' ' ')
  echo "ERROR ${ELAPSED}s stopReason=${STOP_REASON} ${EXCERPT}"
  exit 0
fi

# --- process died without a terminal event -------------------------------
if [ "$ALIVE" -eq 0 ]; then
  echo "ERROR ${ELAPSED}s died-mid-stream events=${SZ}B"
  exit 0
fi

# --- bounds ---------------------------------------------------------------
if [ "$ELAPSED" -gt "$WALL_CLOCK" ]; then echo "TIMEOUT ${ELAPSED}s"; exit 0; fi

MTIME=$(stat -f %m "$EVENTS" 2>/dev/null || stat -c %Y "$EVENTS")
STALE=$((NOW - MTIME))

# State-aware stall: the last complete event tells us whether quiet is normal.
# (tail -1 can be a partially-written line; fall back one line if unparseable.)
LAST_TYPE=$(tail -1 "$EVENTS" | jq -r '.type' 2>/dev/null || true)
[ -z "$LAST_TYPE" ] && LAST_TYPE=$(tail -2 "$EVENTS" | head -1 | jq -r '.type' 2>/dev/null || true)

EFFECTIVE_THRESHOLD="$STALL_THRESHOLD"
[ "$LAST_TYPE" = "tool_execution_start" ] && EFFECTIVE_THRESHOLD=$((STALL_THRESHOLD * 2))

if [ "$STALE" -gt "$EFFECTIVE_THRESHOLD" ]; then
  echo "STALL ${ELAPSED}s stale=${STALE}s last=${LAST_TYPE:-?}"
  exit 0
fi

echo "ALIVE ${ELAPSED}s events=${SZ}B stale=${STALE}s last=${LAST_TYPE:-?}"
