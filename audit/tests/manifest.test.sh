#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

m=audit/.claude-plugin/plugin.json
[ "$(jq -r .name "$m")" = audit ] || fail "T1 name"
# The pre-commit hook bumps the patch on every commit that touches the plugin, so
# the value cannot be pinned; the shape the hook rewrites can.
v="$(jq -r .version "$m")"
printf '%s\n' "$v" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "T2 version must be semver, got '$v'"
[ "$(grep -c "^  \"version\": \"$v\",\$" "$m")" = 1 ] || fail "T2 version line must be in the form the pre-commit hook rewrites"
[ "$(jq -r .homepage "$m")" = 'https://github.com/musingfox/cc-plugins/tree/main/audit' ] || fail "T3 homepage"
[ "$(jq 'has("commands") or has("skills") or has("agents")' "$m")" = false ] || fail "T4 no component keys"
[ "$(jq -c '.dependencies | sort' "$m")" = '["adr","spec","wizard"]' ] || fail "T5 dependencies must name every plugin the skill routes to"
jq -r .description "$m" | grep -Fq milestone || fail "T6 description names milestone"
[ "$(jq -r .description "$m" | grep -c '"')" = 0 ] || fail "T6 description holds no double quote"
