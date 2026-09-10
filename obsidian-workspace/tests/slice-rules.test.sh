#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=obsidian-workspace/skills/pm/SKILL.md
sec=$(awk '/^## To Tickets/{f=1;print;next} /^## /{f=0} f' "$skill")

n=$(printf '%s\n' "$sec" | grep -c 'schema.*API.*UI.*tests' || true)
[ "$n" -eq 1 ] || fail "T1: schema/API/UI/tests once in To Tickets, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'vertical' || true)
[ "$n" -ge 1 ] || fail "T2: vertical missing"

n=$(printf '%s\n' "$sec" | grep -c 'on its own' || true)
[ "$n" -ge 1 ] || fail "T3: on its own missing"

n=$(printf '%s\n' "$sec" | grep -c 'fresh context window' || true)
[ "$n" -eq 1 ] || fail "T4: fresh context window once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'prefactor' || true)
[ "$n" -ge 2 ] || fail "T5: prefactor on at least two lines, got $n"

n=$(printf '%s\n' "$sec" | grep -cF 'make the change easy, then make the easy change' || true)
[ "$n" -eq 1 ] || fail "T6: make the change easy sentence missing"
