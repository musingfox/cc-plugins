#!/usr/bin/env bash
# builder-seat-test.sh — committed behavior test for the builder and reviewer
# seats (agents/builder.md, agents/reviewer.md).
#
#   builder tools   self-do mode holds the Edit and Write its instructions use
#   done check      the builder polls only the workers it started; no
#                   machine-wide `ls` decides when it is done
#   reviewer        no model pin (it inherits the caller's, so no pin can make
#                   it weaker than the builder) and no Edit (a judge seat)
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

AGENTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../agents" && pwd)"
BUILDER="$AGENTS/builder.md"
REVIEWER="$AGENTS/reviewer.md"

tools() { sed -n 's/^tools: //p' "$1"; }
step() { # the numbered protocol step whose first line contains $2
  awk -v m="$2" '/^[0-9]+\. /{on = index($0, m) > 0} /^$|^#/{on = 0} on' "$1"
}

B_TOOLS="$(tools "$BUILDER")"
if printf '%s\n' "$B_TOOLS" | grep -qw Edit && printf '%s\n' "$B_TOOLS" | grep -qw Write; then ok "builder tools hold Edit and Write"; else bad "builder tools -> '$B_TOOLS'"; fi

n="$(grep -c 'run `pi-agent.sh ls`' "$BUILDER")"
if [ "$n" = 0 ]; then ok "builder never runs pi-agent.sh ls as its done check"; else bad "builder 'run \`pi-agent.sh ls\`' lines -> $n"; fi
S6="$(step "$BUILDER" 'Before ending ANY turn')"
if [ -n "$S6" ] && printf '%s\n' "$S6" | grep -qF 'pi-agent.sh poll'; then ok "the before-ending step polls the builder's own workers"; else bad "before-ending step -> '$S6'"; fi

n="$(grep -c '^model:' "$REVIEWER")"
if [ "$n" = 0 ]; then ok "reviewer has no model: line"; else bad "reviewer model: lines -> $n"; fi
R_TOOLS="$(tools "$REVIEWER")"
if [ -n "$R_TOOLS" ] && ! printf '%s\n' "$R_TOOLS" | grep -q Edit; then ok "reviewer tools hold no Edit"; else bad "reviewer tools -> '$R_TOOLS'"; fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
