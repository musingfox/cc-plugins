#!/usr/bin/env bash
# Thin adapter: resolve this cf shard's canonical RUNDIR and run the canonical
# pi-poll.sh over it, passing its STATUS= grammar STRAIGHT THROUGH. No token
# translation — cf-pi-run.sh's dispatch_and_poll matches the canonical
# `STATUS=OK… | STATUS=FAIL… | RUNNING…` grammar directly. The legacy cf token
# vocabulary (DONE/ALIVE/ERROR/STALL/NO_OUTPUT/NO_JSONL/…) is retired.
#
# cf-facing interface:
#   Usage:   cf-pi-poll.sh SESSION
#   Stdout:  one canonical pi-poll.sh status line, verbatim, or
#            `STATUS=FAIL … no-pid` when the dispatch handle is missing/broken.
#
# Internally reads $SESSION/pi-rundir (written by cf-pi-dispatch.sh) and delegates
# to "$CANON_DIR/pi-poll.sh" "$RUNDIR".

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

SESSION="$1"
load_cf_pi_env "$SESSION" || { echo "STATUS=FAIL no-pid (session env missing)"; exit 0; }

# Resolve the canonical pi-dispatch/scripts dir via the shared helper.
CANON_DISPATCH="$(resolve_canon_dispatch)"
if [ -z "${CANON_DISPATCH:-}" ] || [ ! -f "$CANON_DISPATCH" ]; then
  echo "STATUS=FAIL no-pid (canonical pi-dispatch unresolved)"
  exit 0
fi
CANON_DIR="$(dirname "$CANON_DISPATCH")"

# Read the canonical RUNDIR recorded by cf-pi-dispatch.sh.
if [ ! -f "$SESSION/pi-rundir" ]; then
  echo "STATUS=FAIL no-pid (pi-rundir absent)"
  exit 0
fi
RUNDIR="$(cat "$SESSION/pi-rundir" 2>/dev/null || true)"
if [ -z "$RUNDIR" ]; then
  echo "STATUS=FAIL no-pid (pi-rundir empty)"
  exit 0
fi

# Pass cf's tunables through so the canonical script respects cf's settings.
export PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-1800}"
export PI_STALL_THRESHOLD_S="${PI_STALL_THRESHOLD_S:-180}"

line="$("$CANON_DIR/pi-poll.sh" "$RUNDIR" 2>/dev/null || true)"
[ -z "$line" ] && line="STATUS=FAIL OUTPUT=$RUNDIR/result.md poll-empty"
echo "$line"
