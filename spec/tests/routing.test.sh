#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

fm() {
  awk 'BEGIN{n=0} /^---$/{n++; next} n==1{print} n>=2{exit}' "$1"
}

spec_fm=$(fm spec/skills/spec/SKILL.md)
n=$(printf '%s\n' "$spec_fm" | grep -c 'use glossary' || true)
[ "$n" -eq 1 ] || fail "T1: spec frontmatter use glossary once, got $n"
n=$(printf '%s\n' "$spec_fm" | grep -c 'use adr' || true)
[ "$n" -eq 1 ] || fail "T1: spec frontmatter use adr once, got $n"

gloss_fm=$(fm spec/skills/glossary/SKILL.md)
n=$(printf '%s\n' "$gloss_fm" | grep -c 'use spec' || true)
[ "$n" -eq 1 ] || fail "T2: glossary frontmatter use spec once, got $n"

n=$(grep -c 'use glossary' spec/skills/spec/SKILL.md || true)
[ "$n" -eq 1 ] || fail "T3: use glossary once in whole spec SKILL.md, got $n"
