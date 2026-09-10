#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md

n=$(grep -c '^## Clean architecture$' "$skill" || true)
[ "$n" -eq 1 ] || fail "T1: ## Clean architecture once, got $n"

range=$(awk '/^## Clean architecture$/{p=1} p && /^## / && !/^## Clean architecture$/{exit} p' "$skill")
n=$(printf '%s\n' "$range" | grep -cF 'Entities and use cases take their names from this glossary' || true)
[ "$n" -eq 1 ] || fail "T2: entities/use-case sentence once, got $n"
