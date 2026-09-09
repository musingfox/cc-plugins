#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(jq -r .name diagnose/.claude-plugin/plugin.json)" = diagnose ] || fail "T1 name"
[ "$(jq -r .version diagnose/.claude-plugin/plugin.json)" = 0.1.0 ] || fail "T2 version"
[ "$(jq -c .dependencies diagnose/.claude-plugin/plugin.json)" = '["cf"]' ] || fail "T3 dependencies"
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
