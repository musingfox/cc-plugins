#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=obsidian-workspace/skills/pm/SKILL.md
sec=$(awk '/^## To Tickets/{f=1;print;next} /^## /{f=0} f' "$skill")

n=$(printf '%s\n' "$sec" | grep -ci 'blockers first' || true)
[ "$n" -ge 1 ] || fail "T1: blockers first missing"

n=$(printf '%s\n' "$sec" | grep -c 'Create task' || true)
[ "$n" -ge 1 ] || fail "T2: Create task missing"

n=$(printf '%s\n' "$sec" | grep -cF 'blocked_by' || true)
[ "$n" -ge 2 ] || fail "T3: blocked_by at least twice, got $n"

n=$(printf '%s\n' "$sec" | grep -cF 'status=blocked' || true)
[ "$n" -eq 1 ] || fail "T4: status=blocked once, got $n"

n=$(printf '%s\n' "$sec" | grep -c 'set once\|once with its complete list' || true)
[ "$n" -eq 1 ] || fail "T5: set-once wording once, got $n"

n=$(printf '%s\n' "$sec" | grep -c 'follows Relations\|see Relations' || true)
[ "$n" -ge 1 ] || fail "T6: follows/see Relations missing"

n=$(printf '%s\n' "$sec" | grep -cF 'parent' || true)
[ "$n" -ge 1 ] || fail "T7: parent missing"

n=$(printf '%s\n' "$sec" | grep -c 'same project' || true)
[ "$n" -ge 1 ] || fail "T8: same project missing"

n=$(printf '%s\n' "$sec" | grep -ci 'never modif' || true)
[ "$n" -ge 1 ] || fail "T9: never modif missing"

n=$(printf '%s\n' "$sec" | grep -c 'never re-run `create`' || true)
[ "$n" -eq 1 ] || fail "T10: never re-run create once, got $n"

n=$(printf '%s\n' "$sec" | grep -cF 'ready-for-agent' || true)
[ "$n" -eq 0 ] || fail "T11: ready-for-agent must be absent"

n=$(printf '%s\n' "$sec" | grep -cF '.scratch' || true)
[ "$n" -eq 0 ] || fail "T12: .scratch must be absent"

n=$(printf '%s\n' "$sec" | grep -cF '<NN>' || true)
[ "$n" -eq 0 ] || fail "T13: <NN> must be absent"

n=$(printf '%s\n' "$sec" | grep -cF 'obsidian vault=' || true)
[ "$n" -eq 0 ] || fail "T14: obsidian vault= must be absent"

n=$(printf '%s\n' "$sec" | grep -cF 'value=' || true)
[ "$n" -eq 0 ] || fail "T15: value= must be absent"

n=$(printf '%s\n' "$sec" | grep -cF 'type=' || true)
[ "$n" -eq 0 ] || fail "T16: type= must be absent"

n=$(grep -c "To add one blocker, \`read\` the task's current \`blocked_by\`" "$skill" || true)
[ "$n" -eq 1 ] || fail "T17: Relations read-back line must be untouched, got $n"

n=$(sed -n 8p "$skill" | grep -cF 'never run `obsidian help`' || true)
[ "$n" -eq 1 ] || fail "T18: line 8 must still say never run obsidian help"
