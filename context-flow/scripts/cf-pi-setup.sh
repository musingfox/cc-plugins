#!/usr/bin/env bash
# Initialize a cf-pi session.
# Usage:   cf-pi-setup.sh
# Stdin:   none
# Stdout:  SESSION path (single line)
# Env in:  PI_PROVIDER, PI_MODEL, PI_STALL_THRESHOLD_S, PI_WALL_CLOCK_S (all optional)
#          CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS (optional gate)
# Side effects:
#   - creates $SESSION (under /tmp) plus $SESSION/pi-sessions/
#   - writes $SESSION/env.sh (sourced by sibling scripts)
#   - writes $SESSION/cleanup.sh (worktree script appends to this)
#   - writes $SESSION/loop-budget.json
#   - records PI_AVAILABLE / NATIVE_AT_AVAILABLE gates into env.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

SESSION="/tmp/context-flow-pi-$(date +%s)-$$-${RANDOM}"
SESSION_BASENAME="$(basename "$SESSION")"
mkdir -p "$SESSION" "$SESSION/pi-sessions"

cat > "$SESSION/loop-budget.json" <<'JSON'
{"phase_reruns":{"research":0,"plan":0,"implement":0,"review":0},"cross_phase_loops":0,"agent_teams_reruns":{"research":0,"review":0}}
JSON

PI_PROVIDER="${PI_PROVIDER:-}"
PI_MODEL="${PI_MODEL:-}"
PI_TRANSPORT="${PI_TRANSPORT:-text}"
case "$PI_TRANSPORT" in
  text|rpc) ;;
  *)
    echo "cf-pi-setup: invalid PI_TRANSPORT=$PI_TRANSPORT (must be text|rpc)" >&2
    exit 1 ;;
esac
if [ -n "$PI_PROVIDER" ] || [ -n "$PI_MODEL" ]; then
  PI_DESC="${PI_PROVIDER:-<pi-default-provider>}/${PI_MODEL:-<pi-default-model>}"
else
  PI_DESC="Pi default config"
fi

PI_AVAILABLE=0
command -v pi >/dev/null 2>&1 && PI_AVAILABLE=1

NATIVE_AT_AVAILABLE=0
[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" = "1" ] && NATIVE_AT_AVAILABLE=1

cat > "$SESSION/env.sh" <<EOF
SESSION="$SESSION"
SESSION_BASENAME="$SESSION_BASENAME"
PLUGIN_ROOT="$PLUGIN_ROOT"
PI_PROTOCOL="$PLUGIN_ROOT/docs/pi-implementer-protocol.md"
BRIEF_FILE="$SESSION/implement-brief.md"
REPORT_FILE="$SESSION/implement-report.md"
PI_STDOUT="$SESSION/pi-stdout.log"
PI_STDERR="$SESSION/pi-stderr.log"
PI_SESSION_DIR="$SESSION/pi-sessions"
CLEANUP_SCRIPT="$SESSION/cleanup.sh"
PI_PROVIDER="$PI_PROVIDER"
PI_MODEL="$PI_MODEL"
PI_DESC="$PI_DESC"
PI_TRANSPORT="$PI_TRANSPORT"
PI_STALL_THRESHOLD_S="${PI_STALL_THRESHOLD_S:-180}"
PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-1800}"
PI_AVAILABLE=$PI_AVAILABLE
NATIVE_AT_AVAILABLE=$NATIVE_AT_AVAILABLE
EOF

echo '#!/usr/bin/env bash' > "$SESSION/cleanup.sh"
chmod +x "$SESSION/cleanup.sh"

echo "$SESSION"
