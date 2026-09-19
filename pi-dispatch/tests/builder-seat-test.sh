#!/usr/bin/env bash
# builder-seat-test.sh — committed behavior test for the builder and reviewer
# seats (agents/builder.md, agents/reviewer.md).
#
#   builder tools   self-do mode holds the Edit and Write its instructions use
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

AGENTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../agents" && pwd)"
BUILDER="$AGENTS/builder.md"

tools() { sed -n 's/^tools: //p' "$1"; }

B_TOOLS="$(tools "$BUILDER")"
if printf '%s\n' "$B_TOOLS" | grep -qw Edit && printf '%s\n' "$B_TOOLS" | grep -qw Write; then ok "builder tools hold Edit and Write"; else bad "builder tools -> '$B_TOOLS'"; fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
