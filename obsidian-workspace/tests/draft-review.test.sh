#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=obsidian-workspace/skills/pm/SKILL.md
sec=$(awk '/^## To Tickets/{f=1;print;next} /^## /{f=0} f' "$skill")

n=$(printf '%s\n' "$sec" | grep -c 'AskUserQuestion' || true)
[ "$n" -ge 1 ] || fail "T1: AskUserQuestion missing"

n=$(printf '%s\n' "$sec" | grep -c 'numbered list' || true)
[ "$n" -eq 1 ] || fail "T2: numbered list once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'too coarse' || true)
[ "$n" -eq 1 ] || fail "T3: too coarse once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'too fine' || true)
[ "$n" -eq 1 ] || fail "T4: too fine once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'until the user approves' || true)
[ "$n" -eq 1 ] || fail "T5: until the user approves once, got $n"

n=$(printf '%s\n' "$sec" | grep -ci 'nothing to split' || true)
[ "$n" -eq 1 ] || fail "T6: nothing to split once, got $n"
