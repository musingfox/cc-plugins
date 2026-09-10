#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md
range=$(awk '/^## What goes in$/{p=1} p && /^## / && !/^## What goes in$/{exit} p' "$skill")

for w in layer port adapter seam module interface; do
  n=$(printf '%s\n' "$range" | grep -cw "$w" || true)
  [ "$n" -ge 1 ] || fail "T1: '$w' must appear as a word, got $n"
done

for p in 'Design Vocabulary' 'context-flow' 'keep their own meaning'; do
  n=$(printf '%s\n' "$range" | grep -c "$p" || true)
  [ "$n" -ge 1 ] || fail "T2: '$p' missing"
done

n=$(printf '%s\n' "$range" | grep -c 'defined in context-flow' || true)
[ "$n" -eq 0 ] || fail "T3: must not claim defined in context-flow"

n=$(printf '%s\n' "$range" | sed 's/port//g' | grep -cw 'port' || true)
[ "$n" -eq 0 ] || fail "T4: after deleting port via sed, grep -cw port must be 0, got $n"
