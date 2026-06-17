#!/usr/bin/env bash
# Thin adapter: stateless one-shot poll over the canonical pi-poll.sh STATUS= grammar,
# translated back into cf's legacy token vocabulary.
#
# cf-facing interface (unchanged):
#   Usage:   cf-pi-poll.sh SESSION
#   Statuses (single token prefix; tail is diagnostic):
#     ALIVE          -- Pi running, events arriving; continue
#     NO_JSONL       -- Pi launched, no events yet (within grace); continue
#     NO_JSONL_FAIL  -- no events past grace, or process died with none; kill+escalate
#     DONE           -- agent_end stopReason "stop"; proceed to report check
#     STALL          -- no event past threshold; kill+escalate
#     ERROR          -- agent_end error/aborted, or process died mid-stream
#     TIMEOUT        -- elapsed > $PI_WALL_CLOCK_S; kill+escalate
#     NO_PID         -- pi.pid missing; dispatch broken; abort
#
# Internally reads $SESSION/pi-rundir (written by cf-pi-dispatch.sh), delegates to
# the canonical "$CANON_DIR/pi-poll.sh" "$RUNDIR", and translates STATUS= grammar.
#
# Token translation:
#   STATUS=OK                             -> DONE
#   STATUS=FAIL ... ERROR                 -> ERROR (preserve errorMessage excerpt)
#   STATUS=FAIL ... STALL                 -> STALL
#   STATUS=FAIL ... TIMEOUT               -> TIMEOUT
#   STATUS=FAIL ... handle=broken/no-pid  -> NO_PID
#   STATUS=FAIL ... no-rc/died-mid-stream -> NO_JSONL_FAIL (treat as no-events-fail)
#   STATUS=FAIL ... (other)               -> ERROR
#   RUNNING settling                      -> NO_JSONL (within grace)
#   RUNNING                               -> ALIVE

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

SESSION="$1"
load_cf_pi_env "$SESSION" || { echo "NO_PID"; exit 0; }

# Resolve the canonical pi-dispatch/scripts dir via the same sibling resolver.
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CANON_DISPATCH="$(ls "$root"/../pi-dispatch/scripts/pi-dispatch.sh \
                     "$root"/../pi-dispatch/*/scripts/pi-dispatch.sh \
                     "$root"/../../pi-dispatch/scripts/pi-dispatch.sh \
                     "$root"/../../pi-dispatch/*/scripts/pi-dispatch.sh 2>/dev/null \
                  | sort -V | tail -1 || true)"
if [ -z "${CANON_DISPATCH:-}" ] || [ ! -f "$CANON_DISPATCH" ]; then
  echo "NO_PID"
  exit 0
fi
CANON_DIR="$(dirname "$CANON_DISPATCH")"

# Read the canonical RUNDIR recorded by cf-pi-dispatch.sh.
if [ ! -f "$SESSION/pi-rundir" ]; then
  # Fallback: check old pi.pid for broken-dispatch guard.
  [ -f "$PI_PID_FILE" ] || { echo "NO_PID"; exit 0; }
  echo "NO_PID"
  exit 0
fi
RUNDIR="$(cat "$SESSION/pi-rundir" 2>/dev/null || true)"
if [ -z "$RUNDIR" ]; then
  echo "NO_PID"
  exit 0
fi

# Delegate to the canonical pi-poll.sh.
# Pass through cf's tunable env vars so the canonical script respects cf's settings.
export PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-1800}"
export PI_STALL_THRESHOLD_S="${PI_STALL_THRESHOLD_S:-180}"

canonical_line="$("$CANON_DIR/pi-poll.sh" "$RUNDIR" 2>/dev/null || true)"

# Compute elapsed for diagnostic tails (best-effort).
START=$(cat "$PI_START_FILE" 2>/dev/null || true)
[ -z "$START" ] && START=$(date +%s)
NOW=$(date +%s)
ELAPSED=$((NOW - START))

# Translate STATUS= grammar -> cf tokens.
case "$canonical_line" in
  STATUS=OK*)
    echo "DONE ${ELAPSED}s"
    ;;
  STATUS=FAIL*ERROR*)
    # Preserve errorMessage excerpt if present in the line.
    EXCERPT="$(printf '%s' "$canonical_line" | grep -oE 'errorMessage[^|]*' | head -c 120 | tr '\n' ' ' || true)"
    echo "ERROR ${ELAPSED}s stopReason=error ${EXCERPT}"
    ;;
  STATUS=FAIL*STALL*)
    echo "STALL ${ELAPSED}s"
    ;;
  STATUS=FAIL*TIMEOUT*)
    echo "TIMEOUT ${ELAPSED}s"
    ;;
  STATUS=FAIL*handle=broken*|STATUS=FAIL*no-pid*)
    echo "NO_PID"
    ;;
  STATUS=FAIL*no-rc*)
    # Died without recording exit code (killed/crashed with no events) -> NO_JSONL_FAIL
    echo "NO_JSONL_FAIL ${ELAPSED}s"
    ;;
  STATUS=FAIL*died-mid-stream*|STATUS=FAIL*died-no-events*)
    # Died mid-stream: if result.md is empty -> no events at all -> NO_JSONL_FAIL
    # If result.md has content but no terminal event -> ERROR
    if [ ! -s "$RUNDIR/result.md" ]; then
      echo "NO_JSONL_FAIL ${ELAPSED}s died-no-events"
    else
      echo "ERROR ${ELAPSED}s died-mid-stream"
    fi
    ;;
  STATUS=FAIL*empty*|STATUS=FAIL*terminal=error*|STATUS=FAIL*)
    # Remaining FAIL sub-classes (empty result, other terminal errors) -> ERROR
    echo "ERROR ${ELAPSED}s"
    ;;
  RUNNING\ settling*)
    # Dead process within no-rc grace, or other settling states -> NO_JSONL
    echo "NO_JSONL ${ELAPSED}s"
    ;;
  RUNNING*)
    # Check if there are any events yet to distinguish ALIVE from NO_JSONL.
    OUTPUT_FILE="$RUNDIR/result.md"
    if [ -s "$OUTPUT_FILE" ]; then
      echo "ALIVE ${ELAPSED}s"
    else
      echo "NO_JSONL ${ELAPSED}s"
    fi
    ;;
  "")
    # Empty output from canonical poll (shouldn't happen) -> treat as NO_PID.
    echo "NO_PID"
    ;;
  *)
    # Unknown output -> escalate as ERROR.
    echo "ERROR ${ELAPSED}s unknown-poll-output"
    ;;
esac
