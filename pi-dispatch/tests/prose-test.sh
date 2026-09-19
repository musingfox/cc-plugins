#!/usr/bin/env bash
# prose-test.sh — committed test that pi-dispatch's docs, skill and scripts say
# what the code does. Pure-local, reads files only.
#
#   retired vocabulary  -> no hit for the yaml routing file, modelRoles, overlay,
#                          haiku or foreman (positive control: the helper finds a
#                          planted hit in a scratch file)
#   settings.json       -> README and SKILL name the file pi actually reads
#
# Patterns are written so this file cannot match itself.
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN="$(cd "$SCRIPT_DIR/.." && pwd)"
README="$PLUGIN/README.md"
SKILL="$PLUGIN/skills/pi-dispatch/SKILL.md"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

retired() { grep -rniE 'modelRoles|overlay|haiku|foreman' "$@"; }

# --- retired vocabulary ---
hits="$(grep -rn 'config\.yml' "$PLUGIN")"
[ -z "$hits" ] && ok "no file in the plugin names the yaml routing file" || bad "yaml routing file named: $hits"

hits="$(retired "$PLUGIN/docs" "$README" "$PLUGIN/skills" "$PLUGIN/scripts")"
[ -z "$hits" ] && ok "docs, README, skill and scripts carry no retired vocabulary" || bad "retired vocabulary: $hits"

printf 'the old liaison was a foreman\n' > "$TMP/control.md"
[ "$(retired "$TMP/control.md" | wc -l | tr -d ' ')" = 1 ] && ok "the retired-vocabulary helper finds a planted hit" || bad "the helper missed a planted hit"

# --- claims the code does not back ---
[ "$(grep -c 'Every terminal line ends with' "$SKILL")" = 0 ] && ok "SKILL no longer claims every terminal line carries usage" || bad "SKILL still claims every terminal line carries usage"
[ "$(grep -c 'With it set' "$README")" = 0 ] && ok "README no longer treats PI_CWD as optional" || bad "README still says 'With it set'"

# --- the file pi reads ---
[ "$(grep -c 'settings\.json' "$README")" -ge 1 ] && ok "README names settings.json" || bad "README does not name settings.json"
[ "$(grep -c 'settings\.json' "$SKILL")" -ge 1 ] && ok "SKILL names settings.json" || bad "SKILL does not name settings.json"

# --- one instruction for waiting on workers ---
DOCTRINE="$PLUGIN/docs/dispatch-doctrine.md"
AGENT="$PLUGIN/scripts/pi-agent.sh"
SENTENCE='From main, run `pi-agent.sh watch` as a background task (`Bash(run_in_background: true)`) and follow it with Monitor; a sub-agent cannot be woken that way, so it runs `watch` in the foreground.'
for f in "$README" "$SKILL" "$DOCTRINE"; do
  n="$(grep -cF "$SENTENCE" "$f")"
  [ "$n" = 1 ] && ok "$(basename "$f") carries the control-plane sentence once" || bad "$(basename "$f") carries the control-plane sentence $n times"
done
[ "$(grep -c run_in_background "$AGENT")" -ge 1 ] && ok "pi-agent.sh header names run_in_background" || bad "pi-agent.sh never names run_in_background"
hits="$(grep -l 'Monitor tool' "$README" "$SKILL" "$DOCTRINE" "$AGENT")"
[ -z "$hits" ] && ok "no doc or script says 'Monitor tool'" || bad "'Monitor tool' still in: $hits"

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
