#!/usr/bin/env bash
# pi-build.sh — BLOCKING build-via-Pi wrapper for spiral's BUILD act.
#
# One Bash call in, one terminal OUTCOME out. Delegates the dispatch+block+reap
# composition to the canonical pi-run.sh (whose detached watchdog reaps the worker
# at the deadline even if this call's owner dies mid-wait), and reformats the
# outcome with spiral's MODEL label (+ an outcome.txt on disk).
#
# Division of labor (load-bearing): this script offloads only the LABOR of writing
# code. Pi edits the files its brief points at — pass --cwd with a WORKTREE so
# those edits land in isolation, never in the live tree. This script does NOT run
# the gate — judging the build against the frozen gate, deciding a re-brief, and
# falling back are convergence's job (the judgment stays on Claude).
#
# Usage:
#   pi-build.sh [--cwd DIR] BRIEF_FILE [OUTDIR]
#     --cwd DIR  — run the dispatch from DIR (the courier's isolation worktree);
#                  relative paths in the brief resolve there.
#     BRIEF_FILE — a self-contained build brief (path). convergence assembles it.
#     OUTDIR     — base dir for run artifacts (default: ${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/spiral).
#
# Env:
#   PI_PROFILE                       — named capability tier from pi-dispatch's
#                                      profiles.conf (fast < balanced < careful);
#                                      explicit PI_PROVIDER/PI_MODEL still win.
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

# Optional leading --cwd DIR: run the dispatch from DIR (the courier's worktree).
BUILD_CWD=""
if [ "${1:-}" = "--cwd" ]; then
  BUILD_CWD="${2:?--cwd needs DIR}"
  shift 2
fi

BRIEF_FILE="${1:?usage: pi-build.sh [--cwd DIR] BRIEF_FILE [OUTDIR]}"
OUTDIR="${2:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/spiral}"
# Absolute-ify before any cd so --cwd cannot re-point them.
case "$BRIEF_FILE" in /*) ;; *) BRIEF_FILE="$PWD/$BRIEF_FILE" ;; esac
case "$OUTDIR"     in /*) ;; *) OUTDIR="$PWD/$OUTDIR"         ;; esac

# Routing label: mirror what the canonical pi-dispatch.sh will actually resolve
# (env > profile > canonical default) via its no-launch introspection seam, so
# the OUTCOME line never drifts from the real routing.
PROVIDER="${PI_PROVIDER:-}"
MODEL="${PI_MODEL:-}"
if [ -z "$MODEL" ] && [ -n "$CANON_DISPATCH" ] && [ -f "$CANON_DISPATCH" ]; then
  _resolved="$(PI_RESOLVE_PROFILE_ONLY=1 "$CANON_DISPATCH" 2>/dev/null)"   # "PROVIDER=… MODEL=…"
  PROVIDER="$(printf '%s' "$_resolved" | sed -n 's/^PROVIDER=\([^ ]*\).*/\1/p')"
  MODEL="$(printf '%s' "$_resolved" | sed -n 's/.*MODEL=//p')"
fi
MODEL_LABEL="${PROVIDER:+$PROVIDER/}${MODEL:-unresolved}"

# Cap the wall-clock UNDER the harness's 600s Bash-tool ceiling so the poll loop's
# own TIMEOUT (which group-kills the orphan pi via pi-stop.sh before returning) always
# fires first. Exported so the child pi-poll.sh inherits it. A genuinely longer build
# FAILs here and convergence falls back rather than leaking a killed-mid-loop pi.
export PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-480}"
# Belt-and-suspenders script-level deadline: if poll somehow never reports terminal,
# cancel and FAIL before the harness ceiling rather than getting killed mid-loop.
SCRIPT_DEADLINE="${PI_BUILD_DEADLINE_S:-540}"

if [ -z "$CANON_DISPATCH" ] || [ ! -f "$CANON_DISPATCH" ]; then
  echo "OUTCOME=FAIL OUTPUT= MODEL=$MODEL_LABEL | pi-dispatch-not-found"
  exit 0
fi

CANON_DIR="$(dirname "$CANON_DISPATCH")"

# The edit-prompt Pi receives as its last positional argument — plumbed via PI_PROMPT
# so the canonical pi-dispatch.sh forwards it verbatim to the pi invocation.
export PI_PROMPT="Read the brief and execute it: make the changes it specifies directly in the working-tree files (your edit/write tools are enabled). Do NOT just describe the changes. When finished, print a one-line list of the files you changed and nothing else."

# Agent binary missing -> immediate FAIL so convergence can fall back to building
# itself. Delegated to the canonical probe — spiral owns no agent-binary handling.
if ! probe_line="$("$CANON_DIR/pi-probe.sh" --bin-only 2>/dev/null)"; then
  echo "OUTCOME=FAIL OUTPUT= MODEL=$MODEL_LABEL | pi-not-found (${probe_line:-probe-failed})"
  exit 0
fi

# Run to terminal via the canonical pi-run.sh: dispatch + block + one OUTCOME line.
# Its detached watchdog reaps the worker at the deadline even if THIS process (or
# the courier's Bash call above us) is killed mid-wait — orphan safety no longer
# depends on the courier passing the right Bash-tool timeout.
# --cwd: run the dispatch from an isolation dir (worktree) so the worker's cwd —
# and every relative path in the brief — lands there, never in the live tree.
if [ -n "$BUILD_CWD" ]; then cd "$BUILD_CWD" || {
  echo "OUTCOME=FAIL OUTPUT= MODEL=$MODEL_LABEL | bad --cwd $BUILD_CWD"
  exit 0
}; fi
line="$("$CANON_DIR/pi-run.sh" --deadline "$SCRIPT_DEADLINE" "$BRIEF_FILE" "$OUTDIR")"
RUNDIR="$(printf '%s\n' "$line" | sed -n 's/.*RUNDIR=\([^ ]*\).*/\1/p')"
OUTPUT="$(printf '%s\n' "$line" | sed -n 's/.*OUTPUT=\([^ ]*\).*/\1/p')"
STATUS_TAIL="${line#*| }"
case "$line" in
  OUTCOME=OK*)  out="OUTCOME=OK OUTPUT=$OUTPUT MODEL=$MODEL_LABEL | $STATUS_TAIL" ;;
  *)            out="OUTCOME=FAIL OUTPUT=$OUTPUT MODEL=$MODEL_LABEL | $STATUS_TAIL" ;;
esac
printf '%s\n' "$out"
[ -n "$RUNDIR" ] && printf '%s\n' "$out" > "$RUNDIR/outcome.txt"
exit 0
