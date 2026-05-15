#!/usr/bin/env bash
# Launch Pi in the background with the assembled brief.
# Records pi.pid + pi-start.ts so cf-pi-poll.sh can monitor the run statelessly.
#
# Usage:   cf-pi-dispatch.sh SESSION
# Stdout:  PI_PID
#
# Hard rules (mirrored from $PI_PROTOCOL §1):
#   - Pass the brief via @"$BRIEF_FILE"; never via "$(cat $BRIEF_FILE)" (shell expansion hangs Pi).
#   - Pass --provider/--model only when the user set $PI_PROVIDER / $PI_MODEL.
#   - Always pass --session-dir; never --no-session or --mode json.
#   - Background + disown so the Bash tool can return without SIGHUPing Pi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

date +%s > "$session/pi-start.ts"

cd "$WORK"
pi -p \
   ${PI_ARGS[@]+"${PI_ARGS[@]}"} \
   --session-dir "$PI_SESSION_DIR" \
   @"$BRIEF_FILE" \
   "Read the brief and execute it. When finished, print exactly DONE and nothing else." \
   > "$PI_STDOUT" 2> "$PI_STDERR" &
PI_PID=$!
echo "$PI_PID" > "$session/pi.pid"
disown
echo "$PI_PID"
