#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(grep -c '^### Audit (Experimental)$' README.md)" -eq 1 ] || fail "T1 ### Audit (Experimental) heading"
[ "$(grep -c '^/plugin install audit$' README.md)" -eq 1 ] || fail "T2 install command"
[ "$(grep -c '^├── audit/ *skills: docs, tests · agents: docs-classifier, tests-tracer · scripts, tests$' README.md)" -eq 1 ] || fail "T3 tree row"

want='├── apple-podcasts/,├── audit/,├── calendar/'
got="$(grep -oE '^├── (apple-podcasts|audit|calendar)/' README.md | paste -sd, -)"
[ "$got" = "$want" ] || fail "T4 tree order: got $got"

section="$(awk 'p && /^### /{exit} /^### Audit \(Experimental\)$/{p=1} p' README.md)"
printf '%s\n' "$section" | grep -Fq '/audit:docs' || fail "T5 section names /audit:docs"
printf '%s\n' "$section" | grep -Fq '/audit:tests' || fail "T6 section names /audit:tests"
printf '%s\n' "$section" | grep -Fq 'tests-tracer' || fail "T7 section names tests-tracer"
[ "$(grep -cF 'More audits (tests' README.md)" -eq 0 ] || fail "T8 the planned bullet no longer lists tests"
