#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

cmd=spiral/commands/spiral.md

for p in \
  'https://github.com/mattpocock/skills' \
  '`handoff`' \
  'MIT' \
  'Copyright (c) 2026 Matt Pocock' \
  '3cca18b368ae95cdbdebbff572ccafa662551015'
do
  n=$(grep -cF "$p" "$cmd" || true)
  [ "$n" -ge 1 ] || fail "T1: missing $p"
done

n=$(grep -c 'adapted from .*mattpocock/skills.*`handoff`.*MIT.*3cca18b368ae95cdbdebbff572ccafa662551015' "$cmd" || true)
[ "$n" -eq 1 ] || fail "T2: one unwrapped sha-pinned adapted-from line, got $n"

n=$(grep -c 'temp-directory default is not imported: ' "$cmd" || true)
[ "$n" -eq 1 ] || fail "T3: temp-directory default is not imported: once, got $n"

[ "$(sed -n 7p "$cmd")" = '# Spiral' ] || fail "T4: line 7 must be # Spiral"
