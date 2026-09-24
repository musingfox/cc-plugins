#!/usr/bin/env bash
# pi-dispatch.sh — LAUNCH a work brief on a Pi cheap/fast model in the BACKGROUND.
#
# The point: Claude spends almost no tokens. It writes a small brief, calls this
# script, and gets back an OUTPUT path + a run handle IMMEDIATELY (non-blocking).
# Pi does the heavy lifting in the background on a cheap fast model; the caller
# polls for completion with pi-poll.sh instead of blocking on one long Bash call.
#
# Usage:
#   pi-dispatch.sh BRIEF [OUTDIR [PRIOR_RUNDIR]]
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
#                     and the agent is invoked with --session <sid> --mode json passing
#                     BRIEF via @"$BRIEF_FILE" (the resume brief — NOT the full
#                     prior brief inlined). Everything else (wrapper, artifacts) is
#                     identical to a fresh dispatch.
#
# Stdout (returns instantly, does NOT wait for Pi):
#   OUTPUT=<absolute path to result file>     <- the handle the caller reads later
#   PID=<background wrapper pid (== PGID)>     <- the perl setsid wrapper's pid
#   RUNDIR=<per-run dir holding result/stderr/pid/pgid/rc/start>
#   CWD=<dir> WRITABLE=<list>                  what the run resolved to
#   CMD=<agent command>                        on its own line: it holds spaces
#
# Routing:
#   PI_DISPATCH_CMD  the agent command prefix (default: pi), expanded by bash
#                the way a shell line is: env assignments, a binary on PATH or by
#                absolute path, and its routing flags, e.g.
#                  env PI_CODING_AGENT_DIR=$HOME/.omp/agent omp --model cursor/grok-4.7-medium
#                The agent must speak pi's CLI: the dispatch appends -p --mode json,
#                -e, --session-dir, --session and @brief. Nothing in the command =
#                the agent's own settings choose the model. A newline, #, ;, &, |,
#                < or > is refused: it would cut off the flags the dispatch appends.
#                The command is printed and recorded, so keep secrets out of it.
#                PI_BIN, PI_PROVIDER, PI_MODEL and PI_EXTRA_ARGS are its retired
#                predecessors; any of them set is refused (exit 2).
#
# The command is RECORDED to RUNDIR/routing and REPLAYED on resume: a follow-up
# turn that passes PRIOR_RUNDIR always runs on the binary and agent dir that wrote
# the session, and the session itself carries the model.
#
# Pi prompt (env-overridable):
#   PI_PROMPT    default: "Read the brief above and complete it. Output only the result."
#                Override this to pass a custom system/user prompt (e.g. spiral's
#                BUILD brief prompt) without modifying this script.
#
# Worker directory:
#   PI_CWD       required for a fresh dispatch; pi is launched inside it. Recorded
#                with the routing and replayed on resume (a resume needs no env).
#                Sets up the fence: shims/git on PATH (with
#                PI_REAL_GIT), extensions/worktree-fence.ts via -e, and on macOS
#                a sandbox-exec profile (RUNDIR/sandbox.sb) that denies writes
#                outside the worktree. PI_SANDBOX=0 skips the sandbox.
#   PI_WRITABLE_FILES  optional colon-separated absolute paths of extra FILES
#                outside the worktree the worker may write (a report, a verdict
#                file). Each becomes an exact (literal) sandbox rule and a fence
#                exception; a sibling stays denied. An entry that is relative, has
#                no existing parent, contains " or \, names a directory, or a list
#                with a newline, is refused (exit 2). Empty segments are skipped;
#                a path containing ":" cannot be declared. Recorded as WRITABLE=
#                and replayed on resume: the record beats the env, even when empty.
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

# Migration guard: PI_CONFIG_FILES was the omp-era routing knob. pi has no
# --config, so a leftover export would silently route to pi's default model.
if [ -n "${PI_CONFIG_FILES:-}" ]; then
  echo "pi-dispatch: warning: PI_CONFIG_FILES is ignored (an omp-era routing knob); route with PI_DISPATCH_CMD instead." >&2
fi

# Refused rather than ignored: a leftover PI_MODEL would otherwise run the batch
# on a model nobody chose.
for v in PI_BIN PI_PROVIDER PI_MODEL PI_EXTRA_ARGS; do
  if [ -n "${!v:-}" ]; then
    echo "pi-dispatch: $v is retired; put the binary, routing and flags in one PI_DISPATCH_CMD (e.g. PI_DISPATCH_CMD='pi --model openai-codex/gpt-5.6-terra') and unset $v." >&2
    exit 2
  fi
done

CMD="${PI_DISPATCH_CMD:-pi}"

# The binary the command runs: its words expanded as the launch expands them
# (no globbing), past leading assignments and `env`. Prints "!<reason>" for a
# command the dispatch cannot fence: one that sets a variable the fence
# carries, passes env an option (-i, -u) that could clear them, or names a
# relative binary, which would resolve inside PI_CWD rather than here.
cmd_binary() {
  set +u -f
  eval "set -- $CMD" 2>/dev/null || { echo "!its quoting does not parse"; return; }
  while [ $# -gt 0 ]; do
    case "$1" in
      -*) echo "!it passes env the option $1, which could clear the fence's variables"; return ;;
      PI_CWD=*|PI_WRITABLE_FILES=*|PI_REAL_GIT=*|PATH=*) echo "!it sets ${1%%=*}, which the fence owns"; return ;;
      *=*|env) shift; continue ;;
    esac
    case "$1" in /*) ;; */*) echo "!its binary $1 is relative; give it on PATH or by absolute path"; return ;; esac
    printf '%s\n' "$1"
    return
  done
  echo "!it names no binary"
}

validate_cmd() { # sets BIN, or refuses with exit 2
  # The dispatch's own flags are appended to the command, so anything that ends
  # or garbles it (a comment, ;, &, a pipe, a redirect, a subshell, a trailing
  # backslash) would start the agent without -p, the brief or the fence extension.
  case "$CMD" in *$'\n'*|*[\;\&\|\<\>\#\(\)\`]*|*\\)
    echo "pi-dispatch: PI_DISPATCH_CMD must be one simple command (no newline, #, ;, &, |, <, >, parentheses, backquotes or a trailing backslash): $CMD" >&2
    exit 2 ;;
  esac
  # Measured against pi 2026-09-15: pi resolves the model first and the provider
  # follows it, so --provider alone lands on pi's default while looking pinned.
  case " $CMD " in *" --provider "*|*" --provider="*)
    case " $CMD " in *" --model "*|*" --model="*) ;; *)
      echo "pi-dispatch: PI_DISPATCH_CMD has --provider without --model; pi would run on its default provider. Pin both as --model PROVIDER/MODEL: $CMD" >&2
      exit 2 ;;
    esac ;;
  esac
  BIN="$(cmd_binary)"
  case "$BIN" in '!'*)
    echo "pi-dispatch: PI_DISPATCH_CMD is refused because ${BIN#!}: $CMD" >&2
    exit 2 ;;
  esac
}

validate_cmd
# Check seam (no launch): pi-probe.sh asks here, so the probe and the dispatch
# can never disagree on what they accept or which binary runs.
if [ "${PI_DISPATCH_CHECK:-}" = 1 ]; then
  echo "BIN=$BIN"
  exit 0
fi

BRIEF="${1:?usage: pi-dispatch.sh BRIEF [OUTDIR [PRIOR_RUNDIR]]}"
OUTDIR="${2:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch}"
PRIOR_RUNDIR="${3:-}"

abs() { # physical absolute path of an existing directory, or of a file in one
  if [ -d "$1" ]; then (cd "$1" && pwd -P); else printf '%s/%s\n' "$(cd "$(dirname "$1")" && pwd -P)" "$(basename "$1")"; fi
}

# Every path is absolutized once, here: the worker may be launched in PI_CWD
# (below), and the paths handed to pi must survive that cd.
[ -f "$BRIEF" ] && BRIEF="$(abs "$BRIEF")"
mkdir -p "$OUTDIR"; OUTDIR="$(abs "$OUTDIR")"
[ -n "$PRIOR_RUNDIR" ] && [ -d "$PRIOR_RUNDIR" ] && PRIOR_RUNDIR="$(abs "$PRIOR_RUNDIR")"

# PI_CWD: the directory pi is launched in. pi has no --cwd flag and takes
# process.cwd(), so without this the worker inherits the CALLER's directory —
# for cf that was the human's real checkout, and a bare `git commit` landed there.
# Recorded in RUNDIR/routing and, like the model, the record beats the env on a
# resume: a worker picking its context back up must not move.
PI_CWD="${PI_CWD:-}"
if [ -n "$PRIOR_RUNDIR" ]; then
  if [ -f "$PRIOR_RUNDIR/routing" ] && grep -q '^CWD=.' "$PRIOR_RUNDIR/routing"; then
    PI_CWD="$(sed -n 's/^CWD=//p' "$PRIOR_RUNDIR/routing")"
  else
    # A run recorded before CWD= existed: pi keys the session on the directory
    # it started in and, moved elsewhere, asks "Fork this session?" on a stdin
    # that is /dev/null — the resume dies mid-stream. Take the cwd from the
    # session header instead, and say so.
    for f in "$PRIOR_RUNDIR/pi.stream.jsonl" "$PRIOR_RUNDIR/result.md"; do
      [ -f "$f" ] || continue
      hdr="$(jq -rs 'map(select(.type=="session"))[0].cwd // empty' "$f" 2>/dev/null || true)"
      [ -n "$hdr" ] && { PI_CWD="$hdr"; echo "pi-dispatch: warning: prior run recorded no CWD; resuming in the session's own directory $hdr" >&2; break; }
    done
  fi
fi
# Deny by default: an unset PI_CWD used to mean "wherever the caller stands",
# which for every non-cf dispatch was the human's checkout. Running there on
# purpose is spelled PI_CWD="$PWD" — that still arms the fence.
if [ -z "$PI_CWD" ]; then
  echo "pi-dispatch: PI_CWD is not set. A worker runs and is fenced inside PI_CWD; pass the worktree (PI_CWD=<dir>), or PI_CWD=\"\$PWD\" to run here deliberately." >&2
  exit 2
fi
if [ ! -d "$PI_CWD" ]; then
  echo "pi-dispatch: PI_CWD is not a directory: $PI_CWD" >&2
  exit 2
fi
PI_CWD="$(abs "$PI_CWD")"
export PI_CWD

# PI_WRITABLE_FILES: extra files outside the worktree the worker may write.
# Each entry lands raw in the SBPL profile and in the line-based routing record,
# so anything that could break either (a quote, a backslash, a newline) is
# refused rather than escaped. abs() prints "/<basename>" for a missing parent,
# so the parent is checked on the raw path first.
writable_refuse() {
  echo "pi-dispatch: PI_WRITABLE_FILES entry '$1' $2; declare absolute, colon-separated file paths whose directory exists." >&2
  exit 2
}
#
# Like CWD=, the record beats the env on a resume, even when it is empty: a
# resuming shell cannot widen a worker's write set. Recorded paths replay as-is;
# only a run recorded before WRITABLE= existed falls back to the env.
WRITABLE=""
writable_env="${PI_WRITABLE_FILES:-}"
if [ -n "$PRIOR_RUNDIR" ] && [ -f "$PRIOR_RUNDIR/routing" ] && grep -q '^WRITABLE=' "$PRIOR_RUNDIR/routing"; then
  WRITABLE="$(sed -n 's/^WRITABLE=//p' "$PRIOR_RUNDIR/routing" | head -n 1)"
  writable_env=""
fi
case "$writable_env" in *$'\n'*) writable_refuse "$writable_env" "contains a newline" ;; esac
rest="$writable_env"
while [ -n "$rest" ]; do
  f="${rest%%:*}"
  case "$rest" in *:*) rest="${rest#*:}" ;; *) rest="" ;; esac
  [ -n "$f" ] || continue
  case "$f" in /*) ;; *) writable_refuse "$f" "is not absolute" ;; esac
  [ -d "$(dirname "$f")" ] || writable_refuse "$f" "has no existing parent directory"
  case "$f" in *'"'*|*'\'*) writable_refuse "$f" "contains a double quote or a backslash" ;; esac
  [ -d "$f" ] && writable_refuse "$f" "is a directory; the unit is a file"
  WRITABLE="${WRITABLE:+$WRITABLE:}$(abs "$f")"
done
PI_WRITABLE_FILES="$WRITABLE"
export PI_WRITABLE_FILES
# The fence: shims/git first on the worker's PATH (it needs the real git's
# location, since it can no longer find it by scanning PATH) and the
# write/edit extension via -e below.
SHIMS="$(abs "$SCRIPT_DIR/../shims")"
PI_REAL_GIT="$(command -v git)"
export PI_REAL_GIT
PATH="$SHIMS:$PATH"
export PATH

# Filesystem sandbox (macOS, PI_SANDBOX not 0): the whole worker
# process tree may write only inside the worktree, the run dir, the per-user
# temp and cache dirs, pi's own state, and the shared git dir a linked worktree
# commits through. This is the fence the shim cannot be: it catches /usr/bin/git
# by absolute path, a rewritten PATH, gh, libgit2, and plain shell writes.
SANDBOX=()
if [ "${PI_SANDBOX:-1}" != "0" ] && [ "$(uname -s)" = Darwin ] && command -v sandbox-exec >/dev/null 2>&1; then
  sb_paths=("$PI_CWD")
  common="$(git -C "$PI_CWD" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  [ -n "$common" ] && sb_paths+=("$(abs "$common")")
  for d in "${TMPDIR:-}" "$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null || true)" "$(getconf DARWIN_USER_CACHE_DIR 2>/dev/null || true)" \
           "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}" "$HOME/.pi" "$HOME/.omp" "$HOME/.cache" "$HOME/.npm" "$HOME/.bun/install/cache" "$HOME/Library/Caches"; do
    [ -n "$d" ] && [ -d "$d" ] && sb_paths+=("$(abs "$d")")
  done
  SANDBOX_PROFILE_PATHS=("${sb_paths[@]}")
  SANDBOX=(pending)
fi

# A resume replays the prior run's command. The record beats the env: the
# session belongs to the binary and agent dir that wrote it. A run recorded
# before CMD= existed resumes on the env command; its session names its model.
if [ -n "$PRIOR_RUNDIR" ] && [ -f "$PRIOR_RUNDIR/routing" ]; then
  if grep -q '^CMD=' "$PRIOR_RUNDIR/routing"; then
    CMD="$(sed -n 's/^CMD=//p' "$PRIOR_RUNDIR/routing" | head -n 1)"
  else
    echo "pi-dispatch: warning: prior run recorded no CMD; resuming with $CMD" >&2
  fi
fi
validate_cmd

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
printf 'CMD=%s\nCWD=%s\nWRITABLE=%s\n' "$CMD" "$PI_CWD" "$WRITABLE" > "$RUNDIR/routing"

if [ ${#SANDBOX[@]} -gt 0 ]; then
  {
    echo '(version 1)'
    echo '(allow default)'
    echo '(deny file-write*)'
    echo '(allow file-write*'
    echo '  (literal "/dev/null") (regex #"^/dev/tty") (regex #"^/dev/fd/") (regex #"^/private/var/run/")'
    # pi's bundled subagents extension keeps its scratch under /tmp/pi-subagents-uid-<uid>/.
    echo '  (regex #"^/private/tmp/pi-subagents-uid-[0-9]+(/|$)")'
    for d in "${SANDBOX_PROFILE_PATHS[@]}" "$RUNDIR"; do printf '  (subpath "%s")\n' "$d"; done
    # One literal per declared file, never its parent: a sibling stays denied.
    # The paths are canonical (/private/tmp, not /tmp), the only spelling SBPL matches.
    rest="$WRITABLE"
    while [ -n "$rest" ]; do
      printf '  (literal "%s")\n' "${rest%%:*}"
      case "$rest" in *:*) rest="${rest#*:}" ;; *) rest="" ;; esac
    done
    echo ')'
  } > "$RUNDIR/sandbox.sb"
  SANDBOX=(sandbox-exec -f "$RUNDIR/sandbox.sb")
fi

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

# The dispatch's own flags, appended after the command's.
PI_ARGS=(-p --mode json)
if [ -n "$PRIOR_SESSION_ID" ]; then
  # --session <id> (NOT --resume: in pi that is the interactive picker and would
  # hang a -p worker). pi resolves the id against --session-dir, so point it at
  # the PRIOR run's sessions dir (where the session lives), not this run's empty one.
  SESSION_DIR="$PRIOR_RUNDIR/sessions"
  PI_ARGS+=(--session "$PRIOR_SESSION_ID")
fi
PI_ARGS+=(-e "$SCRIPT_DIR/../extensions/worktree-fence.ts")
PI_ARGS+=(--session-dir "$SESSION_DIR" @"$BRIEF_FILE" "$PROMPT")

# Every path pi receives is absolute by now, so the cd only moves the worker.
cd "$PI_CWD"

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
' "$RC_FILE" ${SANDBOX[@]+"${SANDBOX[@]}"} bash -fc "exec env $CMD \"\$@\"" pi-dispatch "${PI_ARGS[@]}" \
  < /dev/null > "$OUTPUT_FILE" 2> "$STDERR_FILE" &

WRAP_PID=$!
# setsid makes PGID == the wrapper's own pid, and $! is that wrapper pid, so the
# wrapper pid serves as BOTH the liveness handle (pi.pid) and the kill group
# (pi.pgid). pi-poll.sh probes `kill -0 pi.pid`; pi-stop.sh group-kills -pi.pgid.
printf '%s\n' "$WRAP_PID" > "$PID_FILE"
printf '%s\n' "$WRAP_PID" > "$PGID_FILE"
disown

# Return the handle immediately — do NOT block on Pi.
# CMD= states what the run actually resolved to. It is the only place the
# caller sees the routing before a terminal poll, so a run on the wrong provider
# is visible at launch instead of a ticket later.
echo "CWD=$PI_CWD WRITABLE=$WRITABLE"
echo "CMD=$CMD"
echo "OUTPUT=$OUTPUT_FILE"
echo "PID=$WRAP_PID"
echo "RUNDIR=$RUNDIR"
