#!/usr/bin/env bash
# Pre-flight liveness probe — confirms the resolved Pi provider/model works.
# Caller MUST invoke via the Bash tool with `timeout: 30000` so a hung
# `pi` does not block the orchestrator. macOS has no GNU `timeout(1)`.
#
# Usage:   cf-pi-probe.sh SESSION
# Stdout:  single status line, one of:
#            OK
#            NO_JSONL          (no stdout AND no JSONL produced — Pi failed to start)
#            ERROR:<excerpt>   (JSONL contains "errorMessage": pattern excerpt follows)
# Side effects: writes $PROBE_STDOUT, $PROBE_STDERR,
#               and a session JSONL under $PI_PROBE_DIR/.

set -uo pipefail   # no -e: pi may exit non-zero on quota/auth errors; we classify instead

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

mkdir -p "$PI_PROBE_DIR"

echo "say ok" | pi \
  ${PI_ARGS[@]+"${PI_ARGS[@]}"} \
  --session-dir "$PI_PROBE_DIR" \
  --no-tools > "$PROBE_STDOUT" 2> "$PROBE_STDERR" || true

JSONL=$(ls -t "$PI_PROBE_DIR"/*.jsonl 2>/dev/null | head -1)

if [ -z "$JSONL" ]; then
  if [ ! -s "$PROBE_STDOUT" ]; then
    echo "NO_JSONL"
    exit 0
  fi
  echo "OK"
  exit 0
fi

if grep -q '"errorMessage"' "$JSONL"; then
  pattern=$(grep -o '"errorMessage":"[^"]\{0,80\}' "$JSONL" | head -1 | cut -c17-)
  echo "ERROR:$pattern"
  exit 0
fi

echo "OK"
