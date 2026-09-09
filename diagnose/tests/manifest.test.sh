#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(jq -r .name diagnose/.claude-plugin/plugin.json)" = diagnose ] || fail "T1 name"
[ "$(jq -r .version diagnose/.claude-plugin/plugin.json)" = 0.1.0 ] || fail "T2 version"
# A dependency resolves within the same marketplace by the marketplace entry
# name, which is what /plugin install and enabledPlugins key on — not by the
# dependency's own plugin.json name when the two differ (context-flow vs cf).
deps="$(jq -r '.dependencies[]' diagnose/.claude-plugin/plugin.json)"
[ -n "$deps" ] || fail "T3 dependencies must not be empty"
entries="$(jq -r '.plugins[].name' .claude-plugin/marketplace.json)"
while IFS= read -r d; do
  printf '%s\n' "$entries" | grep -qx "$d" || fail "T3 dependency '$d' is not a marketplace entry name"
done <<< "$deps"
[ "$(jq 'has("commands") or has("skills")' diagnose/.claude-plugin/plugin.json)" = false ] || fail "T4 no component keys"
[ "$(jq -r .homepage diagnose/.claude-plugin/plugin.json)" = 'https://github.com/musingfox/cc-plugins/tree/main/diagnose' ] || fail "T5 homepage"

if [ -z "${DIAGNOSE_TEST_RUNNER:-}" ]; then
  export DIAGNOSE_TEST_RUNNER=1
  REPO="$(git rev-parse --show-toplevel)"
  out="$(cd / && bash "$REPO/diagnose/tests/run.sh")"
  rc=$?
  printf '%s\n' "$out" | tail -n 1 | grep -qx 'test_exit=0' || fail "T6 trailing test_exit=0"
  [ "$rc" -eq 0 ] || fail "T6 exit 0"
fi

unanchored=0
for f in diagnose/tests/*.test.sh; do
  prologue="$(awk '{print} !/^#/ && !/^[[:space:]]*$/ && !/^set([[:space:]]|$)/ {exit}' "$f")"
  hits="$(printf '%s\n' "$prologue" | grep -Fc 'cd "$(git rev-parse --show-toplevel)"' || true)"
  [ "$hits" -gt 0 ] || unanchored=$((unanchored + 1))
done
[ "$unanchored" -eq 0 ] || fail "T7 unanchored files: $unanchored"

echo "ok - manifest.test.sh"
