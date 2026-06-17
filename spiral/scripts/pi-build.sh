#!/usr/bin/env bash
# pi-build.sh — BLOCKING build-via-Pi wrapper for spiral's BUILD act.
#
# The cf-pi-run.sh shape: one Bash call in, one terminal OUTCOME out. It dispatches
# a self-contained build brief to Pi (background, via the canonical pi-dispatch.sh),
# then BLOCKS in a short poll loop until pi-poll.sh reports a terminal STATUS, and
# emits exactly one OUTCOME line (+ an outcome.txt on disk).
#
# Division of labor (load-bearing): this script offloads only the LABOR of writing
# code. Pi edits the working tree as a side effect of acting on the brief. This
# script does NOT run the gate — judging the build against the frozen gate, deciding
# a re-brief, and falling back are convergence's job (the judgment stays on Claude).
#
# Usage:
#   pi-build.sh BRIEF_FILE [OUTDIR]
#     BRIEF_FILE — a self-contained build brief (path). convergence assembles it.
#     OUTDIR     — base dir for run artifacts (default: ${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/spiral).
#
# Env:
#   PI_PROVIDER / PI_MODEL          — routing; defaults are pi-dispatch.sh's cheap/fast.
#   PI_WALL_CLOCK_S                  — hard elapsed ceiling (default 480 here, NOT
#                                      pi-poll's 900: a single blocking Bash call must
#                                      finish under the harness's 600s tool ceiling,
#                                      or it gets killed mid-loop and orphans Pi).
#   PI_STALL_THRESHOLD_S             — no-output stall guard (pi-poll default 300).
#   PI_POLL_INTERVAL_S               — sleep between polls (default 5).
#   PI_RESOLVE_ONLY                  — if set to 1, print RESOLVED=<canonical pi-dispatch
#                                      scripts dir> and exit 0, without dispatching.
#
# Stdout (terminal, last line) and outcome.txt:
#   OUTCOME=OK   OUTPUT=<result.md path> MODEL=<provider/model> | <raw poll line>
#   OUTCOME=FAIL OUTPUT=<result.md path> MODEL=<provider/model> | <reason>
# On FAIL (Pi non-zero / TIMEOUT / STALL / empty / pi-not-found / dispatch-failed)
# convergence falls back to building the code itself — Pi is an accelerator, never a
# single point of failure (forward-continuous must not break).

set -uo pipefail

# Spiral's own root: CLAUDE_PLUGIN_ROOT when invoked by the plugin, else this script's parent.
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Resolve the canonical pi-dispatch scripts dir.
# Search both layouts (flat + versioned) at both depths; take the highest version.
CANON_DISPATCH="$(ls "$root"/../pi-dispatch/scripts/pi-dispatch.sh \
                     "$root"/../pi-dispatch/*/scripts/pi-dispatch.sh \
                     "$root"/../../pi-dispatch/scripts/pi-dispatch.sh \
                     "$root"/../../pi-dispatch/*/scripts/pi-dispatch.sh 2>/dev/null \
                  | sort -V | tail -1)"

# PI_RESOLVE_ONLY introspection: print resolved dir and exit (no dispatch).
# Must run BEFORE argument validation so it works with zero positional args.
if [ "${PI_RESOLVE_ONLY:-}" = "1" ]; then
  if [ -z "$CANON_DISPATCH" ] || [ ! -f "$CANON_DISPATCH" ]; then
    echo "pi-build: cannot resolve canonical pi-dispatch/scripts dir" >&2
    exit 1
  fi
  echo "RESOLVED=$(dirname "$CANON_DISPATCH")"
  exit 0
fi

BRIEF_FILE="${1:?usage: pi-build.sh BRIEF_FILE [OUTDIR]}"
OUTDIR="${2:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/spiral}"

PROVIDER="${PI_PROVIDER:-google}"
MODEL="${PI_MODEL:-gemini-2.5-flash-lite}"
POLL_INTERVAL="${PI_POLL_INTERVAL_S:-5}"

# Cap the wall-clock UNDER the harness's 600s Bash-tool ceiling so the poll loop's
# own TIMEOUT (which group-kills the orphan pi via pi-stop.sh before returning) always
# fires first. Exported so the child pi-poll.sh inherits it. A genuinely longer build
# FAILs here and convergence falls back rather than leaking a killed-mid-loop pi.
export PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-480}"
# Belt-and-suspenders script-level deadline: if poll somehow never reports terminal,
# cancel and FAIL before the harness ceiling rather than getting killed mid-loop.
SCRIPT_DEADLINE="${PI_BUILD_DEADLINE_S:-540}"

if [ -z "$CANON_DISPATCH" ] || [ ! -f "$CANON_DISPATCH" ]; then
  echo "OUTCOME=FAIL OUTPUT= MODEL=$PROVIDER/$MODEL | pi-dispatch-not-found"
  exit 0
fi

CANON_DIR="$(dirname "$CANON_DISPATCH")"

# The edit-prompt Pi receives as its last positional argument — plumbed via PI_PROMPT
# so the canonical pi-dispatch.sh forwards it verbatim to the pi invocation.
export PI_PROMPT="Read the brief and execute it: make the changes it specifies directly in the working-tree files (your edit/write tools are enabled). Do NOT just describe the changes. When finished, print a one-line list of the files you changed and nothing else."

# pi missing -> immediate FAIL so convergence can fall back to building itself.
if ! command -v pi >/dev/null 2>&1; then
  echo "OUTCOME=FAIL OUTPUT= MODEL=$PROVIDER/$MODEL | pi-not-found"
  exit 0
fi

START=$(date +%s)

# Launch Pi (non-blocking) via the canonical pi-dispatch.sh and capture the run handle.
launch="$("$CANON_DIR/pi-dispatch.sh" "$BRIEF_FILE" "$OUTDIR")"
RUNDIR="$(printf '%s\n' "$launch" | sed -n 's/^RUNDIR=//p')"
OUTPUT="$(printf '%s\n' "$launch" | sed -n 's/^OUTPUT=//p')"
if [ -z "$RUNDIR" ]; then
  echo "OUTCOME=FAIL OUTPUT= MODEL=$PROVIDER/$MODEL | dispatch-failed"
  exit 0
fi
OUTCOME_FILE="$RUNDIR/outcome.txt"

emit() {  # emit OUTCOME to both stdout and outcome.txt
  printf '%s\n' "$1" | tee "$OUTCOME_FILE"
}

# Block in a short poll loop until terminal. pi-poll.sh self-cancels an orphan pi on
# TIMEOUT/STALL/ERROR (it calls pi-stop.sh before printing FAIL), so a terminal FAIL
# never leaves a stray pi behind.
while :; do
  line="$("$CANON_DIR/pi-poll.sh" "$RUNDIR")"
  case "$line" in
    STATUS=OK*)
      emit "OUTCOME=OK OUTPUT=$OUTPUT MODEL=$PROVIDER/$MODEL | $line"
      exit 0 ;;
    STATUS=FAIL*)
      emit "OUTCOME=FAIL OUTPUT=$OUTPUT MODEL=$PROVIDER/$MODEL | $line"
      exit 0 ;;
  esac
  # Script-level deadline guard (poll never reported terminal in time).
  if [ $(( $(date +%s) - START )) -gt "$SCRIPT_DEADLINE" ]; then
    "$CANON_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
    emit "OUTCOME=FAIL OUTPUT=$OUTPUT MODEL=$PROVIDER/$MODEL | script-deadline ${SCRIPT_DEADLINE}s"
    exit 0
  fi
  sleep "$POLL_INTERVAL"
done
