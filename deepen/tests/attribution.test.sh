#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

f=deepen/skills/survey/SKILL.md
lic=deepen/docs/LICENSE-upstream

n=$(grep -c 'adapted from .*mattpocock/skills.*MIT.*3cca18b368ae95cdbdebbff572ccafa662551015' "$f" || true)
[ "$n" -eq 1 ] || fail "T1: one unwrapped sha-pinned adapted-from line, got $n"

n=$(grep -cF '`improve-codebase-architecture`' "$f" || true)
[ "$n" -ge 1 ] || fail "T2: skill name, got $n"
n=$(grep -cF 'Copyright (c) 2026 Matt Pocock' "$f" || true)
[ "$n" -ge 1 ] || fail "T2: copyright, got $n"

n=$(grep -o 'not imported: ' "$f" | grep -c . || true)
[ "$n" -eq 2 ] || fail "T3: not imported: must be 2, got $n"

n=$(grep -c 'HTML-REPORT.md' "$f" || true)
[ "$n" -ge 1 ] || fail "T4: HTML-REPORT.md, got $n"
n=$(grep -ci 'grilling' "$f" || true)
[ "$n" -ge 1 ] || fail "T4: grilling, got $n"

[ -f "$lic" ] || fail "LICENSE-upstream missing"
n=$(grep -c 'Copyright (c) 2026 Matt Pocock' "$lic" || true)
[ "$n" -eq 1 ] || fail "T5: LICENSE copyright must be 1, got $n"
n=$(grep -c 'MIT License' "$lic" || true)
[ "$n" -eq 1 ] || fail "T5: MIT License must be 1, got $n"
