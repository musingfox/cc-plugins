#!/usr/bin/env bash
# Thin adapter: stop the OMP process via the canonical pi-stop.sh.
#
# cf-facing interface (unchanged):
#   Usage:   cf-pi-stop.sh SESSION [--abort]
#   Idempotent: re-runs are silent no-ops once pi is gone.
#
# Internally reads $SESSION/pi-rundir and delegates to canonical pi-stop.sh RUNDIR.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
# --abort flag accepted for interface compatibility; canonical stop is always clean.
load_cf_pi_env "$session"

# Resolve the canonical pi-dispatch/scripts dir via the shared helper.
CANON_DISPATCH="$(resolve_canon_dispatch)"
CANON_DIR="$(dirname "${CANON_DISPATCH:-/nonexistent}")"

# Read the canonical RUNDIR recorded by cf-pi-dispatch.sh.
RUNDIR=""
if [ -f "$session/pi-rundir" ]; then
  RUNDIR="$(cat "$session/pi-rundir" 2>/dev/null || true)"
fi

if [ -n "$RUNDIR" ] && [ -f "$CANON_DIR/pi-stop.sh" ]; then
  "$CANON_DIR/pi-stop.sh" "$RUNDIR" 2>/dev/null || true
else
  # Fallback: try the old direct PID kill (idempotent).
  PI_PID=$(cat "$PI_PID_FILE" 2>/dev/null || true)
  if [ -n "$PI_PID" ]; then
    kill -TERM "$PI_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$PI_PID" 2>/dev/null || true
  fi
fi

echo "stop_done"
