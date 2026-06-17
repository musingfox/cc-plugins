#!/usr/bin/env bash
# Thin adapter: launch Pi for ONE cf shard via the canonical pi-dispatch.sh.
#
# cf-facing interface (unchanged):
#   Usage:   cf-pi-dispatch.sh SESSION [RESUME_PROMPT_FILE]
#   Stdout:  PI_PID
#
# Internally delegates to the resolved canonical pi-dispatch/scripts/pi-dispatch.sh.
# Records the canonical RUNDIR into $SESSION/pi-rundir so cf-pi-poll.sh,
# cf-pi-stop.sh, and the readers can locate it without re-parsing dispatch output.
#
# Env introspection:
#   PI_RESOLVE_ONLY=1  — print RESOLVED=<canonical pi-dispatch scripts dir> and
#                        exit 0 (no dispatch, no session required).
#
# Hard rules (inherited from the canonical):
#   - Pass brief via @"$BRIEF_FILE"; never via "$(cat file)".
#   - --mode json always; stdout is the json event stream (result.md in RUNDIR).
#   - Background + disown (canonical does this internally).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

# ---- Sibling resolver (mirror of spiral/scripts/pi-build.sh:40-59) ----------
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

CANON_DISPATCH="$(ls "$root"/../pi-dispatch/scripts/pi-dispatch.sh \
                     "$root"/../pi-dispatch/*/scripts/pi-dispatch.sh \
                     "$root"/../../pi-dispatch/scripts/pi-dispatch.sh \
                     "$root"/../../pi-dispatch/*/scripts/pi-dispatch.sh 2>/dev/null \
                  | sort -V | tail -1 || true)"

# PI_RESOLVE_ONLY introspection: print resolved dir and exit (no dispatch needed).
if [ "${PI_RESOLVE_ONLY:-}" = "1" ]; then
  if [ -z "${CANON_DISPATCH:-}" ] || [ ! -f "$CANON_DISPATCH" ]; then
    echo "cf-pi-dispatch: cannot resolve canonical pi-dispatch/scripts dir" >&2
    exit 1
  fi
  echo "RESOLVED=$(dirname "$CANON_DISPATCH")"
  exit 0
fi

CANON_DIR="$(dirname "$CANON_DISPATCH")"

session="$1"
resume_prompt="${2:-}"
load_cf_pi_env "$session"

# OUTDIR: cf "owns" a context-flow leaf under pi-runs so the index label is
# context-flow AND the RUNDIR is discoverable by poll/stop adapters + readers.
OUTDIR="${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/context-flow"

# Resume: when a prior RUNDIR was recorded, pass it as the canonical 3rd positional.
PRIOR_RUNDIR=""
if [ -n "$resume_prompt" ] && [ -f "$session/pi-rundir" ]; then
  PRIOR_RUNDIR="$(cat "$session/pi-rundir" 2>/dev/null || true)"
fi

# PI_PROMPT: preserve cf's brief prompt behavior (fresh dispatch suffix).
export PI_PROMPT="${PI_PROMPT:-Read the brief and execute it. When finished, print exactly DONE and nothing else.}"

# Pass cf's env vars to the canonical dispatch.
export PI_PROVIDER="${PI_PROVIDER:-}"
export PI_MODEL="${PI_MODEL:-}"
export PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-1800}"
export PI_STALL_THRESHOLD_S="${PI_STALL_THRESHOLD_S:-180}"

# Invoke canonical pi-dispatch.sh (non-blocking; returns OUTPUT/PID/RUNDIR).
# Fresh: pi-dispatch.sh BRIEF OUTDIR
# Resume: pi-dispatch.sh RESUME_PROMPT OUTDIR PRIOR_RUNDIR
if [ -n "$resume_prompt" ] && [ -n "$PRIOR_RUNDIR" ]; then
  dispatch_out="$("$CANON_DIR/pi-dispatch.sh" "$resume_prompt" "$OUTDIR" "$PRIOR_RUNDIR")"
else
  dispatch_out="$("$CANON_DIR/pi-dispatch.sh" "$BRIEF_FILE" "$OUTDIR")"
fi

# Extract the canonical RUNDIR and PID from dispatch stdout.
CANON_RUNDIR="$(printf '%s\n' "$dispatch_out" | sed -n 's/^RUNDIR=//p' | head -1)"
PI_PID_VAL="$(printf '%s\n' "$dispatch_out" | sed -n 's/^PID=//p' | head -1)"

# Record the canonical RUNDIR for adapters and readers.
printf '%s\n' "$CANON_RUNDIR" > "$session/pi-rundir"

# Maintain pi-start.ts for cf-pi-status.sh compatibility.
date +%s > "$PI_START_FILE"

# Echo PID on stdout (cf-pi-run.sh captures this).
echo "$PI_PID_VAL"
