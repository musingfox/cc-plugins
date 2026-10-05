#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

sec=$(cat obsidian-workspace/skills/pm/references/to-tickets.md)

n=$(printf '%s\n' "$sec" | grep -cF -- '-[status:done] -[blocked_by:\"[[\"]" format=json' || true)
[ "$n" -eq 1 ] || fail "T1: frontier query once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'frontier' || true)
[ "$n" -ge 1 ] || fail "T2: frontier missing from To Tickets"

n=$(printf '%s\n' "$sec" | grep -c 'wikilink' || true)
[ "$n" -ge 1 ] || fail "T3: wikilink precondition missing"

n=$(ls obsidian-workspace/templates | grep -c . || true)
[ "$n" -eq 5 ] || fail "T4: templates count 5, got $n"

n=$(grep -c 'Ready' obsidian-workspace/templates/dashboard-project.base || true)
[ "$n" -eq 0 ] || fail "T5: Ready view must not be added"
