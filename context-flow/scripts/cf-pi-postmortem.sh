#!/usr/bin/env bash
# Bounded post-mortem (~5 KB) of a failed Pi run.
# Use on kill-status paths only (STALL / ERROR / TIMEOUT / NO_JSONL_FAIL).
# On DONE the report file IS the post-mortem; skip this script.
#
# Usage:   cf-pi-postmortem.sh SESSION
# Stdout:  echoed JSONL errorMessage matches + tails of JSONL, stderr, stdout.
#          Paths are echoed so caller can Read them on demand.

SESSION="$1"
# shellcheck source=/dev/null
. "$SESSION/env.sh"

JSONL=$(ls -t "$PI_SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
echo "=== JSONL ($JSONL) ==="
[ -n "$JSONL" ] && grep -m 5 '"errorMessage"' "$JSONL" | head -c 2000
[ -n "$JSONL" ] && tail -3 "$JSONL" | head -c 2000
echo "=== Pi stderr ($PI_STDERR) ==="; tail -10 "$PI_STDERR"
echo "=== Pi stdout ($PI_STDOUT) ==="; tail -20 "$PI_STDOUT"
echo "(Read tool on any path above for full content.)"
