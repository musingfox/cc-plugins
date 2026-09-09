#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(jq -r '.plugins[] | select(.name=="diagnose") | .source' .claude-plugin/marketplace.json)" = './diagnose' ] || fail "T1 source"
[ "$(jq -r '.plugins[]|select(.name=="diagnose").description' .claude-plugin/marketplace.json)" = "$(jq -r .description diagnose/.claude-plugin/plugin.json)" ] || fail "T2 description"
[ "$(jq '[.plugins[]|select(.name=="diagnose")]|length' .claude-plugin/marketplace.json)" = 1 ] || fail "T3 unique"
[ "$(head -3 diagnose/tests/marketplace.test.sh | grep -Fc 'cd "$(git rev-parse --show-toplevel)"')" = 1 ] || fail "T4 cd"

echo "ok - marketplace.test.sh"
