#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n="$(grep -c 'skills: init, jot, pm · templates, tests' README.md || true)"
[ "$n" -eq 1 ] || fail "root README tree line count is $n, want 1"

n="$(awk '/^### Obsidian Workspace/,/^### pi-dispatch/' README.md | grep -ci 'tickets' || true)"
[ "$n" -ge 1 ] || fail "root README Obsidian Workspace section must mention tickets"

order="$(grep -oE '^├── (obsidian-workspace|omt|pi-dispatch)/' README.md | paste -sd, -)"
[ "$order" = '├── obsidian-workspace/,├── omt/,├── pi-dispatch/' ] || fail "tree order is $order"

n="$(awk '/^## Skills/,/^## How It Works/' obsidian-workspace/README.md | grep -c 'tickets' || true)"
[ "$n" -eq 1 ] || fail "plugin Skills section tickets count is $n, want 1"

n="$(awk '/^## Task Relations/,/^## Examples/' obsidian-workspace/README.md | grep -cF -- '-[blocked_by:' || true)"
[ "$n" -eq 1 ] || fail "Task Relations must mention -[blocked_by: once, got $n"

n="$(awk '/^## Examples/,0' obsidian-workspace/README.md | grep -c 'into tickets' || true)"
[ "$n" -eq 1 ] || fail "Examples into tickets count is $n, want 1"

n="$(grep -o '"description": "[^"]*"' obsidian-workspace/.claude-plugin/plugin.json | grep -o 'ticket' | grep -c . || true)"
[ "$n" -eq 1 ] || fail "plugin.json description ticket count is $n, want 1"

n="$(awk '/"name": "obsidian-workspace"/,/}/' .claude-plugin/marketplace.json | grep -o 'ticket' | grep -c . || true)"
[ "$n" -eq 1 ] || fail "marketplace.json obsidian-workspace ticket count is $n, want 1"

n="$(grep -cF '"name": "obsidian-workspace"' .claude-plugin/marketplace.json || true)"
[ "$n" -eq 1 ] || fail "marketplace.json plugin name count is $n, want 1"
n="$(awk '/^## Task Relations/,/^## Examples/' obsidian-workspace/README.md | grep -c 'Tasks view' || true)"
[ "$n" -eq 0 ] || fail "Task Relations must not point at a nonexistent Tasks view"
n="$(awk '/^## Task Relations/,/^## Examples/' obsidian-workspace/README.md | grep -c 'frontier is a `search`' || true)"
[ "$n" -eq 1 ] || fail "Task Relations must say the frontier is a search, got $n"
