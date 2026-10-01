#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(grep -c '^### Audit (Experimental)$' README.md)" -eq 1 ] || fail "T1 ### Audit (Experimental) heading"
[ "$(grep -c '^/plugin install audit$' README.md)" -eq 1 ] || fail "T2 install command"
[ "$(grep -c '^├── audit/ *skills: docs · agents: docs-classifier · tests$' README.md)" -eq 1 ] || fail "T3 tree row"

want='├── apple-podcasts/,├── audit/,├── calendar/'
got="$(grep -oE '^├── (apple-podcasts|audit|calendar)/' README.md | paste -sd, -)"
[ "$got" = "$want" ] || fail "T4 tree order: got $got"

section="$(awk 'p && /^### /{exit} /^### Audit \(Experimental\)$/{p=1} p' README.md)"
printf '%s\n' "$section" | grep -Fq '/audit:docs' || fail "T5 section names /audit:docs"
