#!/usr/bin/env bash
# Bounded post-mortem (~5 KB) of a failed OMP run.
# Use on kill-status paths only (STALL / ERROR / TIMEOUT / NO_JSONL_FAIL).
# On DONE the report file IS the post-mortem; skip this script.
#
# Usage:   cf-pi-postmortem.sh SESSION
# Stdout:  error count + echoed JSONL errorMessage matches + tails of canonical
#          RUNDIR artifacts (sessions/*.jsonl, pi.stderr.log, result.md).
#          Paths are echoed so caller can Read them on demand.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

SESSION="$1"
load_cf_pi_env "$SESSION"

# Locate the canonical RUNDIR written by cf-pi-dispatch.sh.
CANON_RUNDIR=""
if [ -f "$SESSION/pi-rundir" ]; then
  CANON_RUNDIR="$(cat "$SESSION/pi-rundir" 2>/dev/null || true)"
fi

# Canonical artifact paths.
if [ -n "$CANON_RUNDIR" ]; then
  JSONL=$(ls -t "$CANON_RUNDIR/sessions"/*.jsonl 2>/dev/null | head -1 || true)
  CANON_STDERR="$CANON_RUNDIR/pi.stderr.log"
  CANON_RESULT="$CANON_RUNDIR/result.md"
else
  # Fallback: no RUNDIR recorded yet (dispatch may have failed before recording).
  JSONL=""
  CANON_STDERR=""
  CANON_RESULT=""
fi

if [ -n "$JSONL" ]; then
  ERROR_COUNT=$(grep -c '"errorMessage"' "$JSONL" 2>/dev/null || echo 0)
else
  ERROR_COUNT=0
fi
echo "=== summary ==="
echo "error_count=$ERROR_COUNT jsonl=${JSONL:-<none>}"
echo "=== JSONL (${JSONL:-<none>}) ==="
[ -n "$JSONL" ] && grep -m 5 '"errorMessage"' "$JSONL" | head -c 2000
[ -n "$JSONL" ] && tail -3 "$JSONL" | head -c 2000
echo "=== OMP stderr (${CANON_STDERR:-<none>}) ==="; [ -n "$CANON_STDERR" ] && tail -10 "$CANON_STDERR"
echo "=== OMP stdout/result (${CANON_RESULT:-<none>}) ==="; [ -n "$CANON_RESULT" ] && tail -20 "$CANON_RESULT"
echo "(Read tool on any path above for full content.)"
