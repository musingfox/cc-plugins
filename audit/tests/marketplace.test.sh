#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

d="$(grep -o '"description": "[^"]*"' audit/.claude-plugin/plugin.json)"
[ "$(grep -cF "$d" .claude-plugin/marketplace.json)" -eq 1 ] || fail "T1 plugin description must appear exactly once in marketplace.json"
[ "$(jq '[.plugins[] | select(.name == "audit" and .source == "./audit")] | length' .claude-plugin/marketplace.json)" -eq 1 ] || fail "T2 one audit entry with source ./audit"
