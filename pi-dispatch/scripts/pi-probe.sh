#!/usr/bin/env bash
# pi-probe.sh — pre-flight probe of the dispatch agent binary and its resolved model.
#
# The canonical "can we dispatch at all?" primitive. Callers (cf, spiral, the
# dispatcher agent) use this instead of touching the agent binary themselves —
# binary name, model resolution, and invocation flags stay pi-dispatch's concern.
#
# Usage:
#   pi-probe.sh --bin-only            fast gate: is the agent binary on PATH?
#   pi-probe.sh [PROBE_DIR]           full probe: run "say ok" on the SAME routing
#                                     pi-dispatch.sh would resolve, sessions + logs
#                                     land in PROBE_DIR (default: a fresh mktemp -d).
#
# Stdout (exactly one line):
#   OK                 binary present; (full probe) model answered
#   NO_BIN (<bin>)     agent binary not on PATH
#   NO_JSONL           binary ran but produced no stdout AND no session jsonl
#   ERROR:<excerpt>    session jsonl contains "errorMessage" (auth/quota/model)
#   STALLED (<n>s)     the round trip outran the deadline and was killed
# Exit code: 0 iff OK (gate-friendly).
#
# The probe bounds itself. It used to rely on the caller passing a Bash timeout,
# a prose convention nothing enforced, so a wedged provider hung whoever called
# it — for cf that meant a shard stuck behind the orchestrator's one-hour
# Monitor with no sign anything was wrong.
#
# Env: PI_BIN (default pi), PI_PROVIDER/PI_MODEL (routing, resolved
#      via pi-dispatch.sh's PI_RESOLVE_ROUTING_ONLY seam),
#      PI_PROBE_DEADLINE_S (default 60).
#
# Full-probe side effects in PROBE_DIR: probe-stdout.log, probe-stderr.log,
# session *.jsonl — diagnostics for a failed probe.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${PI_BIN:-pi}"

BIN_ONLY=0
if [ "${1:-}" = "--bin-only" ]; then
  BIN_ONLY=1
  shift
fi

if ! command -v "$BIN" >/dev/null 2>&1; then
  echo "NO_BIN ($BIN)"
  exit 1
fi
if [ "$BIN_ONLY" = 1 ]; then
  echo "OK"
  exit 0
fi

PROBE_DIR="${1:-$(mktemp -d)}"
mkdir -p "$PROBE_DIR"

# Resolve the exact routing pi-dispatch.sh would use.
_resolved="$(PI_RESOLVE_ROUTING_ONLY=1 "$SCRIPT_DIR/pi-dispatch.sh" 2>/dev/null)"
PROVIDER="$(printf '%s' "$_resolved" | sed -n 's/^PROVIDER=\([^ ]*\).*/\1/p')"
MODEL="$(printf '%s' "$_resolved" | sed -n 's/.* MODEL=//p')"

# Same routing rule as pi-dispatch.sh, or the probe would prove a provider the
# dispatch will not use. A provider without a model cannot be routed at all
# (pi resolves the model first), so report it here rather than probe pi's
# default and call it OK.
if [ -z "$MODEL" ] && [ -n "$PROVIDER" ]; then
  echo "ERROR:PI_PROVIDER=$PROVIDER without PI_MODEL does not route"
  exit 1
fi
PROBE_ARGS=(-p)
if [ -n "$MODEL" ]; then
  PROBE_ARGS+=(--model "${PROVIDER:+$PROVIDER/}$MODEL")
fi

# -p (print mode) is load-bearing: without it pi opens its interactive TUI on a
# non-tty stdin and hangs. The deadline covers the rest: a provider that accepts
# the connection and then never answers.
#
# The child gets its own session+process group so the deadline kills the whole
# tree, and the supervisor leaves the caller's group so a group kill of the
# caller cannot strand the child with nobody enforcing the deadline. macOS ships
# no timeout(1), hence perl.
DEADLINE="${PI_PROBE_DEADLINE_S:-60}"
perl -MPOSIX -e '
  POSIX::setpgid(0, 0);
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
      exit 124;
    }
    select(undef, undef, undef, 0.2);
    $waited += 0.2;
  }
  my $st = $?;
  exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
' "$DEADLINE" "$BIN" "${PROBE_ARGS[@]}" \
  --session-dir "$PROBE_DIR" \
  --no-tools "say ok" < /dev/null > "$PROBE_DIR/probe-stdout.log" 2> "$PROBE_DIR/probe-stderr.log"
PROBE_RC=$?

if [ "$PROBE_RC" -eq 124 ]; then
  echo "STALLED (${DEADLINE}s)"
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
