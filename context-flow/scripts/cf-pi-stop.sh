#!/usr/bin/env bash
# Stop the Pi process (text-mode only).
# Replaces the inline `kill -TERM ... ; sleep 2 ; kill -9` snippet
# in the orchestrator with a single idempotent wrapper.
#
# Usage:   cf-pi-stop.sh SESSION
# Idempotent: re-runs are silent no-ops once pi is gone.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

PI_PID=$(cat "$PI_PID_FILE" 2>/dev/null || true)
if [ -n "$PI_PID" ]; then
  kill -TERM "$PI_PID" 2>/dev/null || true
  sleep 2
  kill -9 "$PI_PID" 2>/dev/null || true
fi
echo "stop_done"
