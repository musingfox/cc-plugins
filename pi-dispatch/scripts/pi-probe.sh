#!/usr/bin/env bash
# pi-probe.sh — pre-flight probe of the dispatch agent binary and its resolved model.
#
# The canonical "can we dispatch at all?" primitive. Callers (cf, spiral, the
# dispatcher agent) use this instead of touching the agent binary themselves —
# binary name, model resolution, and invocation flags stay pi-dispatch's concern.
#
# Usage:
#   pi-probe.sh --bin-only            fast gate: is the agent binary on PATH?
#   pi-probe.sh [PROBE_DIR]           full probe: run "say ok" on the SAME command
#                                     pi-dispatch.sh would run, sessions + logs
#                                     land in PROBE_DIR (default: a fresh mktemp -d).
#
# Stdout (exactly one line):
#   OK                 binary present; (full probe) model answered
#   NO_BIN (<bin>)     agent binary not on PATH (or could not be executed)
#   NO_JSONL           binary ran but produced no stdout AND no session jsonl
#   ERROR:<excerpt>    session jsonl contains "errorMessage" (auth/quota/model),
#                      or pi-dispatch.sh refuses PI_DISPATCH_CMD (its reason follows)
#   STALLED (<n>s)     the round trip outran the deadline and was killed
# Exit code: 0 iff OK (gate-friendly).
#
# The probe bounds itself. It used to rely on the caller passing a Bash timeout,
# a prose convention nothing enforced, so a wedged provider hung whoever called
# it — for cf that meant a shard stuck behind the orchestrator's one-hour
# Monitor with no sign anything was wrong.
#
# Env: PI_DISPATCH_CMD (required, expanded exactly as pi-dispatch.sh does),
#      PI_PROBE_DEADLINE_S (default 60).
#
# Full-probe side effects in PROBE_DIR: probe-stdout.log, probe-stderr.log,
# session *.jsonl — diagnostics for a failed probe.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CMD="${PI_DISPATCH_CMD:-}"

# The dispatch decides what it accepts and which binary runs; asking it keeps
# the probe from ever passing a command the dispatch refuses, or the reverse.
_check_err="$(mktemp)"
if ! _check="$(PI_DISPATCH_CHECK=1 bash "$SCRIPT_DIR/pi-dispatch.sh" 2>"$_check_err")"; then
  _msg="$(grep -v '^pi-dispatch: warning:' "$_check_err" | head -n 1)"
  rm -f "$_check_err"
  echo "ERROR:${_msg#pi-dispatch: }"
  exit 1
fi
rm -f "$_check_err"
BIN="${_check#BIN=}"

BIN_ONLY=0
if [ "${1:-}" = "--bin-only" ]; then
  BIN_ONLY=1
  shift
fi

if [ -z "$BIN" ] || ! command -v "$BIN" >/dev/null 2>&1; then
  echo "NO_BIN ($BIN)"
  exit 1
fi
if [ "$BIN_ONLY" = 1 ]; then
  echo "OK"
  exit 0
fi

PROBE_DIR="${1:-$(mktemp -d)}"
mkdir -p "$PROBE_DIR"

# -p (print mode) is load-bearing: without it pi opens its interactive TUI on a
# non-tty stdin and hangs. The deadline covers the rest: a provider that accepts
# the connection and then never answers.
#
# The child gets its own session+process group so the deadline kills the whole
# tree, and the supervisor leaves the caller's group so a group kill of the
# caller cannot strand the child with nobody enforcing the deadline. macOS ships
# no timeout(1), hence perl.
DEADLINE="${PI_PROBE_DEADLINE_S:-60}"
STALL_MARK="$PROBE_DIR/probe-stalled.mark"
rm -f "$STALL_MARK"
PI_PROBE_STALL_MARK="$STALL_MARK" perl -MPOSIX -e '
  POSIX::setpgid(0, 0);
  my $mark = $ENV{PI_PROBE_STALL_MARK};
  my $deadline = shift @ARGV;
  my $pid = fork();
  exit 127 unless defined $pid;
  if ($pid == 0) { POSIX::setsid(); exec { $ARGV[0] } @ARGV; exit 127; }
  my $waited = 0;
  while (1) {
    last if waitpid($pid, POSIX::WNOHANG()) == $pid;
    if ($waited >= $deadline) {
      kill("TERM", -$pid); sleep 2; kill("KILL", -$pid);
      waitpid($pid, 0);
      if ($mark) { open(my $m, ">", $mark) and print $m "$deadline\n"; }
      exit 124;
    }
    select(undef, undef, undef, 0.2);
    $waited += 0.2;
  }
  my $st = $?;
  exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
' "$DEADLINE" bash -fc "exec env $CMD \"\$@\"" pi-probe -p \
  --session-dir "$PROBE_DIR" \
  --no-tools "say ok" < /dev/null > "$PROBE_DIR/probe-stdout.log" 2> "$PROBE_DIR/probe-stderr.log"
PROBE_RC=$?

# The mark, not the exit code: 124 is also what a bounded pi would return on its
# own, and a probe that answered is not a stalled one.
if [ -f "$STALL_MARK" ]; then
  echo "STALLED (${DEADLINE}s)"
  exit 1
fi
if [ "$PROBE_RC" = 127 ]; then
  echo "NO_BIN ($BIN)"
  exit 1
fi

JSONL="$(ls -t "$PROBE_DIR"/*.jsonl 2>/dev/null | head -1)"

if [ -z "$JSONL" ]; then
  if [ ! -s "$PROBE_DIR/probe-stdout.log" ]; then
    echo "NO_JSONL"
    exit 1
  fi
  echo "OK"
  exit 0
fi

if grep -q '"errorMessage"' "$JSONL"; then
  pattern="$(grep -o '"errorMessage":"[^"]\{0,80\}' "$JSONL" | head -1 | cut -c17-)"
  echo "ERROR:$pattern"
  exit 1
fi

echo "OK"
exit 0
