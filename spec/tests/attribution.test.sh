#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md
ref=spec/skills/glossary/references/context-format.md

for p in \
  'https://github.com/mattpocock/skills' \
  'domain-modeling' \
  'MIT' \
  'Copyright (c) 2026 Matt Pocock' \
  '3cca18b368ae95cdbdebbff572ccafa662551015'
do
  n=$(grep -cF "$p" "$skill" || true)
  [ "$n" -ge 1 ] || fail "T1: SKILL.md missing $p"
  n=$(grep -cF "$p" "$ref" || true)
  [ "$n" -ge 1 ] || fail "T2: context-format.md missing $p"
done

n=$(grep -cF 'CONTEXT-MAP.md' "$skill" || true)
[ "$n" -eq 1 ] || fail "T3: CONTEXT-MAP.md once in SKILL.md, got $n"

n=$(grep -cF 'not imported' "$skill" || true)
[ "$n" -ge 1 ] || fail "T4: not imported missing"
