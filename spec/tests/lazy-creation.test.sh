#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md

n=$(grep -c '^## Where it lives$' "$skill" || true)
[ "$n" -eq 1 ] || fail "T1: ## Where it lives once, got $n"

range=$(awk '/^## Where it lives$/{p=1} p && /^## / && !/^## Where it lives$/{exit} p' "$skill")
n=$(printf '%s\n' "$range" | grep -c 'repo root' || true)
[ "$n" -ge 1 ] || fail "T2: repo root missing"
n=$(printf '%s\n' "$range" | grep -c 'first term is resolved' || true)
[ "$n" -ge 1 ] || fail "T2: first term is resolved missing"
n=$(printf '%s\n' "$range" | grep -cF 'docs/spec/' || true)
[ "$n" -ge 1 ] || fail "T2: docs/spec/ missing"

n=$(grep -ci 'scaffold' "$skill" || true)
[ "$n" -eq 0 ] || fail "T3: scaffold must be absent"

n=$(git ls-files spec/ | grep -c 'CONTEXT.md' || true)
[ "$n" -eq 0 ] || fail "T4: the plugin must not ship a CONTEXT.md"
