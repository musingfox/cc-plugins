#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

d="$(grep -o '"description": "[^"]*"' spec/.claude-plugin/plugin.json)"
[ "$(grep -cF "$d" .claude-plugin/marketplace.json)" -eq 1 ] || fail "plugin description must appear exactly once in marketplace.json"

[ "$(grep -o '"description": "[^"]*"' spec/.claude-plugin/plugin.json | grep -c 'CONTEXT.md')" -eq 1 ] || fail "plugin description must name CONTEXT.md"

[ "$(grep -cF '"name": "spec"' .claude-plugin/marketplace.json)" -eq 1 ] || fail 'marketplace.json must contain "name": "spec" exactly once'
