#!/usr/bin/env bash
# Transport-agnostic stop wrapper. Replaces the inline
# `kill -TERM ... ; sleep 2 ; kill -9` snippet in the orchestrator.
#
# Usage:   cf-pi-stop.sh SESSION [--abort]
#   default:  graceful close (rpc: stdin EOF; text: SIGTERM→SIGKILL)
#   --abort:  forceful interrupt mid-task
#             rpc:  send {"type":"abort"} via fifo, then EOF
#             text: same as default (no abort command available)
#
# Idempotent: re-runs are silent no-ops once pi is gone.

set -uo pipefail

session="$1"
mode="${2:-}"

# shellcheck source=/dev/null
. "$session/env.sh"

if [ "${PI_TRANSPORT:-text}" = "rpc" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  exec "$SCRIPT_DIR/cf-pi-rpc-shutdown.sh" "$session" "$mode"
fi

# Text-mode fallback: traditional signal kill.
PI_PID=$(cat "$session/pi.pid" 2>/dev/null || true)
if [ -n "$PI_PID" ]; then
  kill -TERM "$PI_PID" 2>/dev/null || true
  sleep 2
  kill -9 "$PI_PID" 2>/dev/null || true
fi
echo "stop_done transport=text mode=${mode:-clean}"
