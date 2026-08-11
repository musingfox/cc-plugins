#!/usr/bin/env bash
# pi-dispatch.sh — LAUNCH a work brief on a Pi cheap/fast model in the BACKGROUND.
#
# The point: Claude spends almost no tokens. It writes a small brief, calls this
# script, and gets back an OUTPUT path + a run handle IMMEDIATELY (non-blocking).
# Pi does the heavy lifting in the background on a cheap fast model; the caller
# polls for completion with pi-poll.sh instead of blocking on one long Bash call.
#
# Usage:
#   pi-dispatch.sh [--config PATH] BRIEF [OUTDIR [PRIOR_RUNDIR]]
#     --config PATH — (optional, leading) an omp config overlay (or PI_CONFIG_FILES env),
#                     e.g. ~/.omp/agent/config.codex.yml. The overlay carries the
#                     whole modelRoles table, so routing is one file, not one model.
#                     Omit it and omp resolves from its own ~/.omp/agent/config.yml.
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
#                     and the agent is invoked with --resume <sid> --mode json passing
#                     BRIEF via @"$BRIEF_FILE" (the resume brief — NOT the full
#                     prior brief inlined). Everything else (wrapper, artifacts) is
#                     identical to a fresh dispatch.
#
# Stdout (returns instantly, does NOT wait for Pi):
#   OUTPUT=<absolute path to result file>     <- the handle the caller reads later
#   PID=<background wrapper pid (== PGID)>     <- the perl setsid wrapper's pid
#   RUNDIR=<per-run dir holding result/stderr/pid/pgid/rc/start>
#
# Routing (nothing set = omp's own config decides):
#   PI_BIN       agent binary to invoke (default: omp — the oh-my-pi fork of pi)
#   PI_CONFIG_FILES / --config PATH     omp config overlay (--config); the normal knob
#   PI_PROVIDER  optional; when set, the model is passed as PROVIDER/MODEL
#   PI_MODEL     optional single-model override (omp fuzzy-matches model names).
#                A --model spec beats the overlay's `modelRoles.default`, so set
#                it only to override one model — the overlay is the usual choice.
#   PI_RESOLVE_ROUTING_ONLY=1     print resolved "CONFIG=… PROVIDER=… MODEL=…" and exit
#
# Routing is RECORDED to RUNDIR/routing and REPLAYED on resume: a follow-up turn
# that passes PRIOR_RUNDIR but no routing of its own inherits the prior run's,
# so a resumed session never silently changes model mid-conversation.
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

# Optional leading --config PATH: an omp config overlay, or the PI_CONFIG_FILES env
# var (which is omp's own — an ambient shell setting, not a per-dispatch decision).
# The flag is INTENT; the env is ambient. On a resume that distinction decides who
# wins against the prior run's recorded routing (see the inherit below).
CONFIG="${PI_CONFIG_FILES:-}"
CONFIG_EXPLICIT=0
if [ "${1:-}" = "--config" ]; then
  CONFIG="${2:?--config needs a PATH}"
  CONFIG_EXPLICIT=1
  shift 2
fi

PROVIDER="${PI_PROVIDER:-}"
MODEL="${PI_MODEL:-}"

# Migration guard. PI_PROFILE used to select a pi-dispatch preset; it is now
# omp's own isolated auth/session profile (undocumented alias of OMP_PROFILE).
# We don't unset it — it may be deliberate — but a value left over from the old
# interface silently launches the worker under a profile with no credentials.
if [ -n "${PI_PROFILE:-}" ]; then
  echo "pi-dispatch: warning: PI_PROFILE='$PI_PROFILE' is omp's isolated auth profile, not a pi-dispatch preset (routing moved to --config/PI_CONFIG_FILES). Unset it unless you meant omp's profile." >&2
fi

# The agent binary. Default: omp (oh-my-pi). Override with PI_BIN=pi etc.
PI_BIN="${PI_BIN:-omp}"

# Introspection seam (no launch): print the resolved routing and exit. Lets callers
# and tests verify routing without invoking the binary.
if [ "${PI_RESOLVE_ROUTING_ONLY:-}" = "1" ]; then
  echo "CONFIG=$CONFIG PROVIDER=$PROVIDER MODEL=$MODEL"
  exit 0
fi

BRIEF="${1:?usage: pi-dispatch.sh [--config PATH] BRIEF [OUTDIR [PRIOR_RUNDIR]]}"
OUTDIR="${2:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch}"
PRIOR_RUNDIR="${3:-}"

# A resume inherits the prior run's routing. The recorded routing beats the
# AMBIENT env (PI_CONFIG_FILES is omp's own, and a shell that says grok must not
# hijack a session started on codex); only an explicit --config on this call
# overrides it. Without this a follow-up turn silently changes model mid-session.
if [ "$CONFIG_EXPLICIT" = 0 ] && [ -n "$PRIOR_RUNDIR" ] && [ -f "$PRIOR_RUNDIR/routing" ]; then
  CONFIG="$(sed -n 's/^CONFIG=//p' "$PRIOR_RUNDIR/routing")"
  PROVIDER="$(sed -n 's/^PROVIDER=//p' "$PRIOR_RUNDIR/routing")"
  MODEL="$(sed -n 's/^MODEL=//p' "$PRIOR_RUNDIR/routing")"
fi

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

# Record the resolved routing so a later resume can replay it (see the inherit above).
printf 'CONFIG=%s\nPROVIDER=%s\nMODEL=%s\n' "$CONFIG" "$PROVIDER" "$MODEL" > "$RUNDIR/routing"

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

# Build the omp argv. Routing flags appear ONLY when set — with neither, omp
# resolves from its own ~/.omp/agent/config.yml.
OMP_ARGS=(-p --mode json)
if [ -n "$CONFIG" ]; then
  OMP_ARGS+=(--config "$CONFIG")
fi
if [ -n "$MODEL" ]; then
  # omp takes a single --model spec; a provider (when set) is expressed as a
  # PROVIDER/MODEL prefix rather than the legacy --provider flag.
  OMP_ARGS+=(--model "${PROVIDER:+$PROVIDER/}$MODEL")
fi
if [ -n "$PRIOR_SESSION_ID" ]; then
  # omp resolves --resume ids against --session-dir, so point it at the PRIOR
  # run's sessions dir (where the session actually lives), not this run's empty one.
  SESSION_DIR="$PRIOR_RUNDIR/sessions"
  OMP_ARGS+=(--resume "$PRIOR_SESSION_ID")
fi
OMP_ARGS+=(--session-dir "$SESSION_DIR" @"$BRIEF_FILE" "$PROMPT")

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
' "$RC_FILE" "$PI_BIN" "${OMP_ARGS[@]}" \
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
