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

n="$(grep -ci 'skills-only' obsidian-workspace/.claude-plugin/plugin.json || true)"
[ "$n" -eq 0 ] || fail "plugin.json skills-only count is $n, want 0"
n="$(grep -ci 'skills-only' obsidian-workspace/README.md || true)"
[ "$n" -eq 0 ] || fail "obw README skills-only count is $n, want 0"
n="$(awk '/^### Obsidian Workspace/,/^### pi-dispatch/' README.md | grep -ci 'skills-only' || true)"
[ "$n" -eq 0 ] || fail "root README Obsidian Workspace section skills-only count is $n, want 0"

n="$(grep -o '"description": "[^"]*"' obsidian-workspace/.claude-plugin/plugin.json | grep -c '/issue' || true)"
[ "$n" -ge 1 ] || fail "plugin.json description must mention /issue"
n="$(awk '/"name": "obsidian-workspace"/,/}/' .claude-plugin/marketplace.json | grep -c '/issue' || true)"
[ "$n" -ge 1 ] || fail "marketplace.json obw entry must mention /issue"
n="$(grep -c '/issue' obsidian-workspace/README.md || true)"
[ "$n" -ge 1 ] || fail "obw README must mention /issue"
n="$(awk '/^### Obsidian Workspace/,/^### pi-dispatch/' README.md | grep -c '/issue' || true)"
[ "$n" -ge 1 ] || fail "root README Obsidian Workspace section must mention /issue"

n="$(grep -cF '├── obsidian-workspace/ skills: init, jot, pm · templates, tests · hooks: register (Claude Mod)' README.md || true)"
[ "$n" -eq 1 ] || fail "root README obw tree line count is $n, want 1"
n="$(grep -cF 'Built and tested against Claude Code 2.1.276.' obsidian-workspace/README.md || true)"
[ "$n" -eq 1 ] || fail "obw README Claude Code version line count is $n, want 1"

n="$(awk '/^## Issue Pane/,/^## Prerequisites/' obsidian-workspace/README.md | grep -c 'Open in browser' || true)"
[ "$n" -ge 1 ] || fail "obw README Issue Pane must mention Open in browser"
n="$(awk '/^## Issue Pane/,/^## Prerequisites/' obsidian-workspace/README.md | grep -c 'viz' || true)"
[ "$n" -ge 1 ] || fail "obw README Issue Pane must mention viz"
n="$(awk '/^## Issue Pane/,/^## Prerequisites/' obsidian-workspace/README.md | grep -c 'macOS' || true)"
[ "$n" -ge 1 ] || fail "obw README Issue Pane must mention macOS"

n="$(grep -c 'launches nothing' docs/milestones/obw-issue-pane.md || true)"
[ "$n" -eq 0 ] || fail "obw issue pane milestone launches nothing count is $n, want 0"
n="$(awk '/^## Acceptance criteria/,/^## Left open/' docs/milestones/obw-issue-pane.md | grep -c 'Open in browser' || true)"
[ "$n" -ge 1 ] || fail "obw issue pane milestone acceptance criteria must mention Open in browser"

n="$(awk '/^## Issue Pane/,/^## Prerequisites/' obsidian-workspace/README.md | grep -c 'termaid' || true)"
[ "$n" -ge 1 ] || fail "obw README Issue Pane must mention termaid"
n="$(awk '/^## Issue Pane/,/^## Prerequisites/' obsidian-workspace/README.md | grep -cw 'uv' || true)"
[ "$n" -ge 1 ] || fail "obw README Issue Pane must mention uv"
n="$(awk '/^## Issue Pane/,/^## Prerequisites/' obsidian-workspace/README.md | grep -c 'code block' || true)"
[ "$n" -ge 1 ] || fail "obw README Issue Pane must say a diagram can stay a code block"
n="$(awk '/^## Prerequisites/,/^## Installation/' obsidian-workspace/README.md | grep -w 'uv' | grep -ci 'optional' || true)"
[ "$n" -ge 1 ] || fail "obw README Prerequisites must list uv as optional"
n="$(grep -cF 'termaid@0.9.0' docs/milestones/obw-issue-pane.md || true)"
[ "$n" -ge 1 ] || fail "obw issue pane milestone must mention termaid@0.9.0"
n="$(grep -cF "The only other process it starts is the viz plugin's" docs/milestones/obw-issue-pane.md || true)"
[ "$n" -eq 0 ] || fail "obw issue pane milestone still says render.sh is the only other process"
