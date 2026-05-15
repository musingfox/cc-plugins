#!/usr/bin/env bash
# Cleanly stop the RPC-mode pi for SESSION.
#
# Usage:   cf-pi-rpc-shutdown.sh SESSION [--abort]
#   default:  close stdin only (assumes agent_end already fired)
#   --abort:  send {"type":"abort"} first, give pi 2s to settle, then close stdin
#
# Side effects:
#   - kills $SESSION/fifo-holder.pid       (closes pi's stdin → clean exit)
#   - removes $SESSION/rpc-stdin.fifo
#   - SIGTERM/SIGKILL fallback if pi doesn't exit within 5s
#
# Idempotent: re-runs are safe (kill of dead pid is silent).

set -uo pipefail

session="$1"
mode="${2:-clean}"

# shellcheck source=/dev/null
. "$session/env.sh"

FIFO="$session/rpc-stdin.fifo"
PI_PID=$(cat "$session/pi.pid" 2>/dev/null || true)
HOLDER_PID=$(cat "$session/fifo-holder.pid" 2>/dev/null || true)

# Optional active abort: send the command before closing stdin.
if [ "$mode" = "--abort" ] && [ -p "$FIFO" ]; then
  echo '{"type":"abort","id":"shutdown-abort"}' > "$FIFO" 2>/dev/null || true
  sleep 2
fi

# Close stdin by killing the fifo holder. Pi sees EOF and exits cleanly.
if [ -n "$HOLDER_PID" ] && kill -0 "$HOLDER_PID" 2>/dev/null; then
  kill "$HOLDER_PID" 2>/dev/null || true
fi

# Wait for pi to exit on its own.
if [ -n "$PI_PID" ]; then
  for _ in 1 2 3 4 5; do
    kill -0 "$PI_PID" 2>/dev/null || break
    sleep 1
  done
  # Force-kill if still alive.
  if kill -0 "$PI_PID" 2>/dev/null; then
    kill -TERM "$PI_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$PI_PID" 2>/dev/null || true
  fi
fi

# Clean up fifo.
[ -e "$FIFO" ] && rm -f "$FIFO"

echo "shutdown_done mode=$mode"
