#!/usr/bin/env bash
# pi-dispatch.sh — LAUNCH a work brief on a Pi cheap/fast model in the BACKGROUND.
#
# The point: Claude spends almost no tokens. It writes a small brief, calls this
# script, and gets back an OUTPUT path + a run handle IMMEDIATELY (non-blocking).
# Pi does the heavy lifting in the background on a cheap fast model; the caller
# polls for completion with pi-poll.sh instead of blocking on one long Bash call.
#
# Usage:
#   pi-dispatch.sh [--profile NAME] BRIEF [OUTDIR [PRIOR_RUNDIR]]
#     --profile NAME — (optional, leading) a provider/model preset from profiles.conf
#                     (or PI_PROFILE env). Explicit PI_PROVIDER/PI_MODEL still win.
#     BRIEF         — work description. Either a path to a brief file, or inline text.
#     OUTDIR        — base dir for run artifacts
#                     (default: ${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch — a
#                     PERSISTENT location, so a failed run's stderr/session/rc survive
#                     the $TMPDIR purge and stay diagnosable. pi-poll.sh records each
#                     terminal outcome into $PI_RUNS_DIR/index.log).
#     PRIOR_RUNDIR  — (optional) path to a prior run's RUNDIR for --session resume.
#                     When given, the prior session id is extracted by scanning
#                     the WHOLE stream in PRIOR_RUNDIR/pi.stream.jsonl (primary)
#                     or PRIOR_RUNDIR/result.md (fallback) via
#                       jq -rs 'map(select(.type=="session"))[0].id // empty'
#                     and pi is invoked with --session <sid> --mode json passing
#                     BRIEF via @"$BRIEF_FILE" (the resume brief — NOT the full
#                     prior brief inlined). Everything else (wrapper, artifacts) is
#                     identical to a fresh dispatch.
#
# Stdout (returns instantly, does NOT wait for Pi):
#   OUTPUT=<absolute path to result file>     <- the handle the caller reads later
#   PID=<background wrapper pid (== PGID)>     <- the perl setsid wrapper's pid
#   RUNDIR=<per-run dir holding result/stderr/pid/pgid/rc/start>
#
# Routing (cheap/fast by default; precedence: env > --profile/PI_PROFILE > default):
#   PI_PROVIDER  default: google
#   PI_MODEL     default: gemini-2.5-flash-lite
#   PI_PROFILE / --profile NAME   named preset from profiles.conf (NAME PROVIDER MODEL)
#   PI_PROFILES_FILE              override the profiles.conf path
#   PI_RESOLVE_PROFILE_ONLY=1     print resolved "PROVIDER=… MODEL=…" and exit (no launch)
#
# Pi prompt (env-overridable):
#   PI_PROMPT    default: "Read the brief above and complete it. Output only the result."
#                Override this to pass a custom system/user prompt (e.g. spiral's
#                BUILD brief prompt) without modifying this script.
#
# Process-group model (macOS-first; darwin has no `setsid` binary):
#   We launch pi through a perl POSIX::setsid THIN WRAPPER, backgrounded + disowned.
#   perl setsid() makes the wrapper a NEW session + process-group LEADER, so its
#   PGID equals its own pid (and bash's $! is that same pid) — pi and every bash/
#   tool descendant it spawns inherit this PGID. We record it to pi.pgid; pi-stop.sh
#   group-kills `-$PGID` to take down the WHOLE tree (grandchildren included).
#
#   The wrapper runs pi via perl system() (NOT exec — exec would replace perl and
#   leave nobody to record the exit code). When pi exits, the wrapper translates
#   pi's real wait-status into a shell-convention rc (128+signal if signalled, else
#   the plain exit code) and writes it to the `rc` file. pi-poll.sh uses the rc
#   only as an abnormal-death backstop (rc != 0 → FAIL immediately); the primary
#   terminal-state gate is agent_end.stopReason from the json event stream.
#   A group-killed run never reaches the rc write (the wrapper, as group leader,
#   dies too), so an ABSENT rc on a dead process is the truncated/killed FAIL signal.
#
# Hard rules:
#   - Pass the brief via @"$BRIEF_FILE" — never via "$(cat $BRIEF_FILE)";
#     shell expansion of a large brief hangs Pi.
#   - stdout (the result stream) and stderr (diagnostics) go to SEPARATE files.
#     Never merge them — no 2>&1 here, on purpose.
#   - Pi is always invoked with --mode json so the stdout is the json event stream;
#     pi-poll.sh reads agent_end.stopReason from that stream for terminal state.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Optional leading --profile NAME: a named provider/model preset (see profiles.conf).
# Selectable here or via the PI_PROFILE env var. Explicit PI_PROVIDER/PI_MODEL win.
PI_PROFILE="${PI_PROFILE:-}"
if [ "${1:-}" = "--profile" ]; then
  PI_PROFILE="${2:?--profile needs a NAME}"
  shift 2
fi

# Resolve the profile preset (if any). profiles.conf rows: `NAME PROVIDER MODEL`
# (whitespace-separated; # comments and blank lines ignored). An unknown profile
# warns and falls through to the built-in defaults rather than failing the launch.
_PROF_PROVIDER=""; _PROF_MODEL=""
if [ -n "$PI_PROFILE" ]; then
  PROFILES_FILE="${PI_PROFILES_FILE:-$SCRIPT_DIR/../profiles.conf}"
  if [ -f "$PROFILES_FILE" ]; then
    _row="$(awk -v n="$PI_PROFILE" '!/^[[:space:]]*#/ && NF>=3 && $1==n {print $2, $3; exit}' "$PROFILES_FILE")"
    if [ -n "$_row" ]; then
      _PROF_PROVIDER="${_row%% *}"
      _PROF_MODEL="${_row#* }"
    else
      echo "pi-dispatch: warning: profile '$PI_PROFILE' not in $PROFILES_FILE; using defaults" >&2
    fi
  else
    echo "pi-dispatch: warning: PI_PROFILE='$PI_PROFILE' set but $PROFILES_FILE is absent; using defaults" >&2
  fi
fi

# Precedence: explicit env PI_PROVIDER/PI_MODEL > profile preset > built-in default.
PROVIDER="${PI_PROVIDER:-${_PROF_PROVIDER:-google}}"
MODEL="${PI_MODEL:-${_PROF_MODEL:-gemini-2.5-flash-lite}}"

# Introspection seam (no launch): print the resolved routing and exit. Lets callers
# and tests verify profile resolution without invoking pi.
if [ "${PI_RESOLVE_PROFILE_ONLY:-}" = "1" ]; then
  echo "PROVIDER=$PROVIDER MODEL=$MODEL"
  exit 0
fi

BRIEF="${1:?usage: pi-dispatch.sh [--profile NAME] BRIEF [OUTDIR [PRIOR_RUNDIR]]}"
OUTDIR="${2:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch}"
PRIOR_RUNDIR="${3:-}"

PROMPT="${PI_PROMPT:-Read the brief above and complete it. Output only the result.}"

RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUNDIR="$OUTDIR/run-$RUN_ID"
SESSION_DIR="$RUNDIR/sessions"
OUTPUT_FILE="$RUNDIR/result.md"
STDERR_FILE="$RUNDIR/pi.stderr.log"
PID_FILE="$RUNDIR/pi.pid"
PGID_FILE="$RUNDIR/pi.pgid"
RC_FILE="$RUNDIR/rc"
START_FILE="$RUNDIR/pi-start.ts"
mkdir -p "$SESSION_DIR"

# Normalize the brief into a file so we can hand it to Pi via @file (never via
# inline command substitution).
if [ -f "$BRIEF" ]; then
  BRIEF_FILE="$BRIEF"
else
  BRIEF_FILE="$RUNDIR/brief.md"
  printf '%s\n' "$BRIEF" > "$BRIEF_FILE"
fi

# Record the start wall-clock (epoch seconds). pi-poll.sh reads this same start
# file to compute elapsed for wall-clock + no-rc-grace decisions.
date +%s > "$START_FILE"

# Resolve resume session id when PRIOR_RUNDIR is given.
# Primary: scan the WHOLE pi.stream.jsonl (raw event stream preserved by pi-poll.sh
# after a successful distill round-trip; result.md is rewritten to prose at that
# point so the session header is no longer in result.md).
# Fallback: scan the WHOLE result.md (covers runs where pi.stream.jsonl is absent,
# e.g. older runs or a failed prior run where distill did not occur).
# If neither yields a session id, emit a warning and proceed FRESH.
#   {"type":"session","id":"sess-abc"} -> sess-abc
PRIOR_SESSION_ID=""
if [ -n "$PRIOR_RUNDIR" ]; then
  PRIOR_STREAM="$PRIOR_RUNDIR/pi.stream.jsonl"
  PRIOR_RESULT="$PRIOR_RUNDIR/result.md"
  if [ -f "$PRIOR_STREAM" ]; then
    PRIOR_SESSION_ID="$(jq -rs 'map(select(.type=="session"))[0].id // empty' "$PRIOR_STREAM" 2>/dev/null || true)"
  fi
  if [ -z "$PRIOR_SESSION_ID" ] && [ -f "$PRIOR_RESULT" ]; then
    PRIOR_SESSION_ID="$(jq -rs 'map(select(.type=="session"))[0].id // empty' "$PRIOR_RESULT" 2>/dev/null || true)"
  fi
  if [ -z "$PRIOR_SESSION_ID" ]; then
    echo "pi-dispatch: warning: PRIOR_RUNDIR=$PRIOR_RUNDIR has no recoverable session id; starting a FRESH dispatch" >&2
  fi
fi

# Launch Pi through the perl POSIX::setsid wrapper, BACKGROUNDED + disowned.
#
# The wrapper (perl one-liner):
#   1. POSIX::setsid() — become a new session + process-group LEADER. After this
#      getpgrp()==$$, so the wrapper's pid IS the PGID that pi + descendants share.
#   2. system(pi …) — run pi as a child, blocking until it exits. stdout/stderr are
#      already redirected to their own separate files by the shell below (streams
#      stay split on purpose; stdout and stderr are never merged).
#   3. translate pi's wait-status to a shell-convention rc and write it to `rc`:
#        signalled -> 128 + signal ; otherwise -> exit code (status >> 8).
#      A group-kill of -$PGID destroys the wrapper too, so it never gets here — an
#      absent `rc` on a dead process is exactly the killed/truncated FAIL signal.
#
# Pi is always invoked with --mode json so stdout is the json event stream.
# The stream lands in result.md during the run; pi-poll.sh distills the human-
# readable text from agent_end on terminal OK and saves the raw stream as
# pi.stream.jsonl.

if [ -n "$PRIOR_SESSION_ID" ]; then
  # Resume path: --session <sid> --mode json, brief via @file.
  perl -MPOSIX -e '
    POSIX::setsid();
    my $rcfile = shift @ARGV;
    my $status = system(@ARGV);
    my $rc;
    if ($status == -1)        { $rc = 127; }                 # could not exec pi
    elsif ($status & 127)     { $rc = 128 + ($status & 127); } # killed by signal
    else                      { $rc = $status >> 8; }          # normal exit code
    open(my $fh, ">", $rcfile) or exit 255;
    print $fh "$rc\n";
    close($fh);
  ' "$RC_FILE" \
    pi -p \
       --mode json \
       --provider "$PROVIDER" \
       --model "$MODEL" \
       --session "$PRIOR_SESSION_ID" \
       --session-dir "$SESSION_DIR" \
       @"$BRIEF_FILE" \
       "$PROMPT" \
    > "$OUTPUT_FILE" 2> "$STDERR_FILE" &
else
  # Fresh dispatch: --mode json, brief via @file.
  perl -MPOSIX -e '
    POSIX::setsid();
    my $rcfile = shift @ARGV;
    my $status = system(@ARGV);
    my $rc;
    if ($status == -1)        { $rc = 127; }                 # could not exec pi
    elsif ($status & 127)     { $rc = 128 + ($status & 127); } # killed by signal
    else                      { $rc = $status >> 8; }          # normal exit code
    open(my $fh, ">", $rcfile) or exit 255;
    print $fh "$rc\n";
    close($fh);
  ' "$RC_FILE" \
    pi -p \
       --mode json \
       --provider "$PROVIDER" \
       --model "$MODEL" \
       --session-dir "$SESSION_DIR" \
       @"$BRIEF_FILE" \
       "$PROMPT" \
    > "$OUTPUT_FILE" 2> "$STDERR_FILE" &
fi

WRAP_PID=$!
# setsid makes PGID == the wrapper's own pid, and $! is that wrapper pid, so the
# wrapper pid serves as BOTH the liveness handle (pi.pid) and the kill group
# (pi.pgid). pi-poll.sh probes `kill -0 pi.pid`; pi-stop.sh group-kills -pi.pgid.
printf '%s\n' "$WRAP_PID" > "$PID_FILE"
printf '%s\n' "$WRAP_PID" > "$PGID_FILE"
disown

# Return the handle immediately — do NOT block on Pi.
echo "OUTPUT=$OUTPUT_FILE"
echo "PID=$WRAP_PID"
echo "RUNDIR=$RUNDIR"
