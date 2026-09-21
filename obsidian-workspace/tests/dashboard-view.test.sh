#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

tpl=obsidian-workspace/templates/dashboard-project.base
counts=obsidian-workspace/hooks/counts.ts

last=$(grep '^    name:' "$tpl" | tail -1)
[ "$last" = '    name: "All Tasks"' ] || fail "T1: last name: line is $last, want All Tasks"

block=$(awk '/name: "All Tasks"/{f=1} f' "$tpl")
filters=$(printf '%s\n' "$block" | awk '/^    filters:/{f=1;next} f && /^    [a-z]/{exit} f')
filter_items=$(printf '%s\n' "$filters" | sed -n 's/^ *- //p' | tr -d "'")
[ "$filter_items" = 'type == "task"' ] || fail "T2: All Tasks filter is [$filter_items], want type == \"task\""

order=$(printf '%s\n' "$block" | awk '/^    order:/{f=1;next} f && (/^    [a-z]/ || /^  - /){exit} f' | sed 's/^ *- //' | paste -sd, -)
[ "$order" = 'title,status,priority,due,completed,type,tags' ] || fail "T3: All Tasks order is $order"

n=$(printf '%s\n' "$block" | grep -cE 'sort|limit|groupBy|displayName|formula\.|file\.|blocked_by' || true)
[ "$n" -eq 0 ] || fail "T4: All Tasks block matched $n forbidden lines"

props=$(awk '/^properties:/{f=1} /^views:/{exit} f' "$tpl")
n=$(printf '%s\n' "$props" | grep -cE '^  (title|status|priority|due|completed|type|tags):' || true)
[ "$n" -eq 0 ] || fail "T5: properties block mapped raw keys, got $n"

n=$(grep -cF "COUNT_VIEW = 'All Tasks'" "$counts" || true)
[ "$n" -eq 1 ] || fail "T6: COUNT_VIEW count is $n, want 1"
n=$(grep -cF 'name: "All Tasks"' "$tpl" || true)
[ "$n" -eq 1 ] || fail "T6: All Tasks name count is $n, want 1"

