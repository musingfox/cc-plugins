#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=obsidian-workspace/skills/pm/SKILL.md
sec=$(awk '/^## To Tickets/{f=1;print;next} /^## /{f=0} f' "$skill")

n=$(grep -cF -- '-[status:done] -[blocked_by:' "$skill" || true)
[ "$n" -eq 1 ] || fail "T1: frontier query once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'frontier' || true)
[ "$n" -ge 1 ] || fail "T2: frontier missing from To Tickets"

n=$(printf '%s\n' "$sec" | grep -c 'wikilink' || true)
[ "$n" -ge 1 ] || fail "T3: wikilink precondition missing"

n=$(ls obsidian-workspace/templates | grep -c . || true)
[ "$n" -eq 6 ] || fail "T4: templates count 6, got $n"

n=$(grep -c 'Ready' obsidian-workspace/templates/dashboard-project.base || true)
[ "$n" -eq 0 ] || fail "T5: Ready view must not be added"
