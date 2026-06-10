#!/usr/bin/env bash
# Launch Pi in the background with the assembled brief (json event mode).
# Records pi.pid + pi-start.ts so cf-pi-poll.sh can monitor the run statelessly.
#
# Usage:   cf-pi-dispatch.sh SESSION [RESUME_PROMPT_FILE]
#   Fresh (no 2nd arg): new Pi session, prompt = @"$BRIEF_FILE".
#   Resume: re-open the previous Pi session (--session <id>, extracted from the
#   prior run's event stream) and send RESUME_PROMPT_FILE as the new prompt —
#   Pi keeps its full working context (re-brief without a cold start). Falls
#   back to a fresh full-brief dispatch when no prior session id can be found.
# Stdout:  PI_PID
#
# Hard rules (mirrored from $PI_PROTOCOL §1):
#   - Pass prompts via @"file"; never via "$(cat file)" (shell expansion hangs Pi).
#   - Pass --provider/--model only when the user set $PI_PROVIDER / $PI_MODEL.
#   - `--mode json`: stdout ($PI_STDOUT) is the event stream — one JSON object
#     per line, terminal `agent_end` event carries stopReason (verified
#     2026-06-11; the earlier "--mode json hangs" note was a stale v0.73.1 claim).
#   - Always pass --session-dir (resume needs the session file); never --no-session.
#   - Background + disown so the Bash tool can return without SIGHUPing Pi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
resume_prompt="${2:-}"
load_cf_pi_env "$session"

# Resume only works if the prior run's event stream still has its session id.
prior_sid=""
if [ -n "$resume_prompt" ] && [ -s "$PI_STDOUT" ]; then
  prior_sid=$(head -1 "$PI_STDOUT" | jq -r 'select(.type=="session") | .id // empty' 2>/dev/null || true)
fi

date +%s > "$PI_START_FILE"

cd "$WORK"
if [ -n "$prior_sid" ]; then
  mv -f "$PI_STDOUT" "$PI_STDOUT.prev" 2>/dev/null || true
  pi -p --mode json \
     ${PI_ARGS[@]+"${PI_ARGS[@]}"} \
     --session-dir "$PI_SESSION_DIR" \
     --session "$prior_sid" \
     @"$resume_prompt" \
     > "$PI_STDOUT" 2>> "$PI_STDERR" &
else
  pi -p --mode json \
     ${PI_ARGS[@]+"${PI_ARGS[@]}"} \
     --session-dir "$PI_SESSION_DIR" \
     @"$BRIEF_FILE" \
     "Read the brief and execute it. When finished, print exactly DONE and nothing else." \
     > "$PI_STDOUT" 2> "$PI_STDERR" &
fi
PI_PID=$!
echo "$PI_PID" > "$PI_PID_FILE"
disown
echo "$PI_PID"
