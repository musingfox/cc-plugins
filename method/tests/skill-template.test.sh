#!/usr/bin/env bash
# Self-test for the method skill's own files: the contracts.json template must
# pass check-contracts.sh, and no supporting file may use the plugin-root
# placeholder (Claude Code substitutes it only in SKILL.md).

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$HERE/../skills/method"
SCRIPT="$HERE/../scripts/check-contracts.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The ```json block of contracts.md, copied as a node would.
awk '/^```json/{p=1;next} /^```/{p=0} p' "$SKILL_DIR/contracts.md" >"$TMP/template.json"
out="$(bash "$SCRIPT" "$TMP/template.json" 2>"$TMP/err")"; rc=$?
err="$(cat "$TMP/err")"
if [ "$rc" -eq 0 ] && [ -z "$out" ] && [ -z "$err" ]; then
  ok "contracts.md template passes check-contracts.sh (exit 0, stdout and stderr empty)"
else
  bad "contracts.md template (exit $rc want 0; stdout '$out'; stderr '$err')"
fi

# CLAUDE_PLUGIN_ROOT only in SKILL.md.
hits="$(grep -l 'CLAUDE_PLUGIN_ROOT' "$SKILL_DIR"/* 2>/dev/null | grep -v '/SKILL\.md$' || true)"
if [ -z "$hits" ]; then
  ok "no file besides SKILL.md contains CLAUDE_PLUGIN_ROOT"
else
  bad "CLAUDE_PLUGIN_ROOT found outside SKILL.md: $(echo "$hits" | xargs -n1 basename | tr '\n' ' ')"
fi

echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
