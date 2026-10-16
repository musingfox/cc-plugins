#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

SPEC="${SPEC_FILE:-docs/spec/mod-ui-text-within-element-bounds.md}"

scope="$(awk '/^scope:/{f=1;next} /^verify:/{f=0} f' "$SPEC")"
expected='  - "obsidian-workspace/hooks/**"
  - "calendar/hooks/**"
  - "omp-quota/hooks/**"'
[ "$scope" = "$expected" ] || fail "scope list must be obsidian-workspace, calendar, omp-quota hooks in that order"

[ "$(grep -c 'next scope to add' "$SPEC" || true)" -eq 0 ] || fail "stale 'next scope to add' sentence must be gone"
[ "$(grep -c 'register.ts:106' "$SPEC" || true)" -eq 0 ] || fail "stale register.ts:106 reference must be gone"

[ "$(tail -c 24 "$SPEC"; printf x)" = "$(printf 'no check in the module.\nx')" ] || fail "file must end with 'no check in the module.' and one newline"

[ "$(grep -c '^verify: null$' "$SPEC" || true)" -eq 1 ] || fail "verify: null must stay"
[ "$(grep -c '^status: accepted$' "$SPEC" || true)" -eq 1 ] || fail "status: accepted must stay"
