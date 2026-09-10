#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(jq -r .name deepen/.claude-plugin/plugin.json)" = deepen ] || fail "T1 name"
# The pre-push hook bumps the patch on every push that touches the plugin, so
# the value cannot be pinned. What must hold is the shape the hook parses and
# rewrites: semver, written exactly as "version": "x.y.z" on one line.
v="$(jq -r .version deepen/.claude-plugin/plugin.json)"
printf '%s\n' "$v" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "T2 version must be semver, got '$v'"
[ "$(grep -c "^  \"version\": \"$v\",\$" deepen/.claude-plugin/plugin.json)" = 1 ] || fail "T2 version line must be in the form the pre-push hook rewrites"
[ "$(jq -r .homepage deepen/.claude-plugin/plugin.json)" = 'https://github.com/musingfox/cc-plugins/tree/main/deepen' ] || fail "T3 homepage"
deps="$(jq -r '.dependencies[]' deepen/.claude-plugin/plugin.json)"
[ "$deps" = viz ] || fail "T4 dependencies must be exactly viz, got '$deps'"
printf '%s\n' "$(jq -r '.plugins[].name' .claude-plugin/marketplace.json)" | grep -qx viz || fail "T4 viz is not a marketplace entry name"
[ "$(jq 'has("commands") or has("skills")' deepen/.claude-plugin/plugin.json)" = false ] || fail "T5 no component keys"

unanchored=0
for f in deepen/tests/*.test.sh; do
  prologue="$(awk '{print} !/^#/ && !/^[[:space:]]*$/ && !/^set([[:space:]]|$)/ {exit}' "$f")"
  hits="$(printf '%s\n' "$prologue" | grep -Fc 'cd "$(git rev-parse --show-toplevel)"' || true)"
  [ "$hits" -gt 0 ] || unanchored=$((unanchored + 1))
done
[ "$unanchored" -eq 0 ] || fail "T12 unanchored files: $unanchored"
