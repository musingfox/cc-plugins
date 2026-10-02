#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n="$(grep -c '"types": "./types/index.d.ts"' obsidian-workspace/.claude-plugin/plugin.json || true)"
[ "$n" -eq 1 ] || fail "T1: plugin.json must name the types contract once, got $n"

contract=obsidian-workspace/types/index.d.ts
grep -q 'interface PluginState' "$contract" || fail "T2: the contract must declare interface PluginState"
grep -qE '^ +obw: ' "$contract" || fail "T2: the contract must declare the obw key"
n="$(grep -c '^import' "$contract" || true)"
[ "$n" -eq 0 ] || fail "T2: the contract must not import, got $n import lines"

claude plugin validate obsidian-workspace > /dev/null || fail "T3: claude plugin validate obsidian-workspace must exit 0"

# A $.state write redraws exactly its readers, so the pane never asks for a redraw itself.
n="$(cat obsidian-workspace/hooks/*.ts | grep -o 'ui\.invalidate' | grep -c . || true)"
[ "$n" -eq 0 ] || fail "T4: hooks must not call ui.invalidate, got $n occurrences"
