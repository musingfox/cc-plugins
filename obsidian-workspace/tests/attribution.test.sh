#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=obsidian-workspace/skills/pm/SKILL.md

n=$(grep -c 'adapted from .*mattpocock/skills.*to-tickets.*MIT.*3cca18b368ae95cdbdebbff572ccafa662551015' "$skill" || true)
[ "$n" -eq 1 ] || fail "T1: one unwrapped sha-pinned adapted-from line, got $n"

n=$(grep -cF 'Copyright (c) 2026 Matt Pocock' "$skill" || true)
[ "$n" -eq 1 ] || fail "T2: Copyright (c) 2026 Matt Pocock once, got $n"

n=$(grep -cF "Upstream's wide refactor expand-contract sequencing is not imported: " "$skill" || true)
[ "$n" -eq 1 ] || fail "T3: not-imported sentence missing"

n=$(grep -c 'https://github.com/mattpocock/skills' "$skill" || true)
[ "$n" -eq 1 ] || fail "T4: github.com/mattpocock/skills once, got $n"
