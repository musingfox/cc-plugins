#!/usr/bin/env bash
# A cf:implement builder never bypasses git hooks.
#
# Hooks carry the repo's commit-message and version-bump rules; a builder that
# turns them off lands commits the gates never meant to accept.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

IMPLEMENT="$CF_TESTS_DIR/../agents/implement.md"
RULES="$(sed -n '/^## Rules/,$p' "$IMPLEMENT")"

has() { grep -qiE "$1" <<<"$RULES" && echo 1 || echo 0; }

assert_eq "1" "$(has 'no-verify')" "T1 Rules forbid --no-verify"
assert_eq "1" "$(has 'core\.hooksPath')" "T2 Rules forbid overriding core.hooksPath"
assert_eq "1" "$(grep -iE 'hook' <<<"$RULES" | grep -ciE 'ESCALATE_FILE' | sed 's/^[1-9][0-9]*$/1/')" \
  "T3 a blocked hook is escalated, not worked around"
