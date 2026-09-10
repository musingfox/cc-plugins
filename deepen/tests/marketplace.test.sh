#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(jq -r '.plugins[] | select(.name=="deepen") | .source' .claude-plugin/marketplace.json)" = './deepen' ] || fail "T6 source"
want='Survey a codebase for deepening opportunities — shallow modules, leaking seams, interfaces that are hard to test through — and hand the candidates to viz as a Mermaid report'
[ "$(jq -r .description deepen/.claude-plugin/plugin.json)" = "$want" ] || fail "T7 plugin.json description"
[ "$(jq -r '.plugins[]|select(.name=="deepen").description' .claude-plugin/marketplace.json)" = "$want" ] || fail "T7 marketplace description"
[ "$(jq '[.plugins[]|select(.name=="deepen")]|length' .claude-plugin/marketplace.json)" = 1 ] || fail "T7 unique"
