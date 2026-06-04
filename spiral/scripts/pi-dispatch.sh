#!/usr/bin/env bash
# pi-dispatch.sh — LAUNCH a work brief on a Pi cheap/fast model in the BACKGROUND.
#
# The point: Claude spends almost no tokens. It writes a small brief, calls this
# script, and gets back an OUTPUT path + a run handle IMMEDIATELY (non-blocking).
# Pi does the heavy lifting in the background on a cheap fast model; the caller
# polls for completion with pi-poll.sh instead of blocking on one long Bash call.
#
# Usage:
#   pi-dispatch.sh BRIEF [OUTDIR]
#     BRIEF   — work description. Either a path to a brief file, or inline text.
#     OUTDIR  — base dir for run artifacts (default: $TMPDIR/pi-dispatch).
#
# Stdout (returns instantly, does NOT wait for Pi):
#   OUTPUT=<absolute path to result file>     <- the handle the caller reads later
#   PID=<background wrapper pid (== PGID)>     <- the perl setsid wrapper's pid
#   RUNDIR=<per-run dir holding result/stderr/pid/pgid/rc/start>
#
# Routing (cheap/fast by default; override via env):
#   PI_PROVIDER  default: google
#   PI_MODEL     default: gemini-2.5-flash-lite
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
#   the plain exit code) and writes it to the `rc` file. pi-poll.sh reads `rc` to
#   judge OK (rc==0) vs FAIL. A group-killed run
#   never reaches the rc write (the wrapper, as group leader, dies too), so an
#   ABSENT rc on a dead process is the truncated/killed FAIL signal.
#
# Hard rules:
#   - Pass the brief via @"$BRIEF_FILE" — never via "$(cat $BRIEF_FILE)";
#     shell expansion of a large brief hangs Pi.
#   - stdout (the result) and stderr (diagnostics) go to SEPARATE files.
#     Never merge them — no 2>and1 here, on purpose.

set -euo pipefail

BRIEF="${1:?usage: pi-dispatch.sh BRIEF [OUTDIR]}"
OUTDIR="${2:-${TMPDIR:-/tmp}/pi-dispatch}"

PROVIDER="${PI_PROVIDER:-google}"
MODEL="${PI_MODEL:-gemini-2.5-flash-lite}"

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
     --provider "$PROVIDER" \
     --model "$MODEL" \
     --session-dir "$SESSION_DIR" \
     @"$BRIEF_FILE" \
     "Read the brief and execute it: make the changes it specifies directly in the working-tree files (your edit/write tools are enabled). Do NOT just describe the changes. When finished, print a one-line list of the files you changed and nothing else." \
  > "$OUTPUT_FILE" 2> "$STDERR_FILE" &
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
