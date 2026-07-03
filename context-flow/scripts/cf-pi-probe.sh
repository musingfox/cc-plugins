#!/usr/bin/env bash
# Thin adapter: pre-flight liveness probe via the canonical pi-dispatch/pi-probe.sh.
# cf owns NO agent-binary handling — binary name, model resolution, and invocation
# flags are pi-dispatch's concern. Caller MUST invoke via the Bash tool with
# `timeout: 30000` so a hung probe does not block the orchestrator.
#
# cf-facing interface (unchanged):
#   Usage:   cf-pi-probe.sh SESSION
#   Stdout:  single status line: OK | NO_BIN (<bin>) | NO_JSONL | ERROR:<excerpt>
# Side effects: probe-stdout.log / probe-stderr.log / session *.jsonl in $PI_PROBE_DIR.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

CANON_DISPATCH="$(resolve_canon_dispatch)"
if [ -z "${CANON_DISPATCH:-}" ] || [ ! -f "$CANON_DISPATCH" ]; then
  echo "ERROR:canonical pi-dispatch unresolved"
  exit 0
fi

"$(dirname "$CANON_DISPATCH")/pi-probe.sh" "$PI_PROBE_DIR"
exit 0
