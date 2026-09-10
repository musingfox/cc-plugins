#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=obsidian-workspace/skills/pm/SKILL.md

n=$(grep '^description:' "$skill" | grep -o 'tickets' | grep -c . || true)
[ "$n" -eq 1 ] || fail "T1: description must contain tickets once, got $n"

n=$(grep -c '^description:' "$skill" || true)
[ "$n" -eq 1 ] || fail "T2: one description line, got $n"

n=$(grep '^description:' "$skill" | grep -cF 'Requires `.obsidian.yaml`' || true)
[ "$n" -eq 1 ] || fail "T3: description must keep Requires \`.obsidian.yaml\`"

n=$(awk '/^## Operations/,/^### ADR numbering/' "$skill" | grep -c '^- \*\*To tickets\*\*' || true)
[ "$n" -eq 1 ] || fail "T4: Operations must have To tickets bullet, got $n"
