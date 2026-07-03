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
#                                     pi-dispatch.sh would resolve (env > profile >
#                                     default), sessions + logs land in PROBE_DIR
#                                     (default: a fresh mktemp -d).
#
# Stdout (exactly one line):
#   OK                 binary present; (full probe) model answered
#   NO_BIN (<bin>)     agent binary not on PATH
#   NO_JSONL           binary ran but produced no stdout AND no session jsonl
#   ERROR:<excerpt>    session jsonl contains "errorMessage" (auth/quota/model)
# Exit code: 0 iff OK (gate-friendly).
#
# Env: PI_BIN (default omp), PI_PROVIDER/PI_MODEL/PI_PROFILE (routing, resolved
#      via pi-dispatch.sh's PI_RESOLVE_PROFILE_ONLY seam).
#
# Full-probe side effects in PROBE_DIR: probe-stdout.log, probe-stderr.log,
# session *.jsonl — diagnostics for a failed probe.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${PI_BIN:-omp}"

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

# Resolve the exact routing pi-dispatch.sh would use (env > profile > default).
_resolved="$(PI_RESOLVE_PROFILE_ONLY=1 "$SCRIPT_DIR/pi-dispatch.sh" 2>/dev/null)"
PROVIDER="$(printf '%s' "$_resolved" | sed -n 's/^PROVIDER=\([^ ]*\).*/\1/p')"
MODEL="$(printf '%s' "$_resolved" | sed -n 's/.*MODEL=//p')"
MODEL_SPEC="${PROVIDER:+$PROVIDER/}$MODEL"

# -p (print mode) is load-bearing: without it omp opens its interactive TUI on a
# non-tty stdin and hangs until the caller's timeout kills it.
"$BIN" -p \
  ${MODEL_SPEC:+--model "$MODEL_SPEC"} \
  --session-dir "$PROBE_DIR" \
  --no-tools "say ok" > "$PROBE_DIR/probe-stdout.log" 2> "$PROBE_DIR/probe-stderr.log" || true

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
