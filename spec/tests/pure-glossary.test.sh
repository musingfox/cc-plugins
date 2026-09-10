#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md

range=$(awk '/^## What goes in$/{p=1} p && /^## / && !/^## What goes in$/{exit} p' "$skill")

n=$(printf '%s\n' "$range" | grep -c 'names a thing in the problem domain' || true)
[ "$n" -eq 1 ] || fail "T1: expected that phrase once, got $n"

n=$(printf '%s\n' "$range" | grep -c 'what it IS' || true)
[ "$n" -eq 1 ] || fail "T2: expected what it IS once, got $n"

n=$(printf '%s\n' "$range" | grep -cF 'a glossary and nothing else' || true)
[ "$n" -eq 1 ] || fail "T3: expected a glossary and nothing else once, got $n"

n=$(grep -c '^## What goes in$' "$skill" || true)
[ "$n" -eq 1 ] || fail "T4: ## What goes in once, got $n"
