#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

f=deepen/agents/explorer.md
report=deepen/docs/report.md
skill=deepen/skills/survey/SKILL.md

range=$(awk '/^## Design Vocabulary/{p=1;print;next} p && /^## /{exit} p' "$f")

for term in '**Module**' '**Interface**' '**Implementation**' '**Depth**' \
            '**Seam**' '**Adapter**' '**Leverage**' '**Locality**'; do
  n=$(printf '%s\n' "$range" | grep -cF -- "$term" || true)
  [ "$n" -ge 1 ] || fail "T1: glossary missing $term"
done

for phrase in 'Deletion test' 'interface is the test surface' 'One adapter' \
              'Two adapters' 'implementation lines' 'Do not substitute' 'Domain words'; do
  n=$(printf '%s\n' "$range" | grep -cF -- "$phrase" || true)
  [ "$n" -ge 1 ] || fail "T2: glossary missing $phrase"
done

for phrase in \
  'https://github.com/mattpocock/skills' \
  '`codebase-design`' \
  'Copyright (c) 2026 Matt Pocock' \
  '3cca18b368ae95cdbdebbff572ccafa662551015'
do
  n=$(printf '%s\n' "$range" | grep -cF -- "$phrase" || true)
  [ "$n" -ge 1 ] || fail "T3: glossary missing $phrase"
done
n=$(printf '%s\n' "$range" | grep -c . || true)
[ "$n" -ge 20 ] || fail "T3: glossary range must be >= 20 lines, got $n"

without=$(awk '/^## Design Vocabulary/{p=1} p && /^## / && !/^## Design Vocabulary/{p=0} !p {print}' "$f")
n1=$(printf '%s\n%s\n%s\n' "$without" "$(cat "$report")" "$(cat "$skill")" | grep -Ei 'component|service|boundar' | grep -c . || true)
n2=$(printf '%s\n%s\n%s\n' "$without" "$(cat "$report")" "$(cat "$skill")" | grep -E 'API' | grep -c . || true)
[ "$((n1 + n2))" -eq 0 ] || fail "T4: forbidden count must be 0, got $((n1 + n2))"

copy=$(mktemp)
cat "$report" > "$copy"
printf '%s\n' 'the component boundary' >> "$copy"
cn1=$(grep -Ei 'component|service|boundar' "$copy" | grep -c . || true)
cn2=$(grep -E 'API' "$copy" | grep -c . || true)
[ "$((cn1 + cn2))" -ge 1 ] || fail "T5: injected copy must count >= 1"
on1=$(grep -Ei 'component|service|boundar' "$report" | grep -c . || true)
on2=$(grep -E 'API' "$report" | grep -c . || true)
[ "$((on1 + on2))" -eq 0 ] || fail "T5: originals must still be 0"
rm -f "$copy"
