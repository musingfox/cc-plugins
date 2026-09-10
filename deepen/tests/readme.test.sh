#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(grep -c '^### Deepen$' README.md)" -eq 1 ] || fail "T8 ### Deepen heading"
[ "$(grep -c '/plugin install deepen' README.md)" -eq 1 ] || fail "T8 install command"

section="$(awk 'p && /^### /{exit} /^### Deepen$/{p=1} p' README.md)"
printf '%s\n' "$section" | grep -Fq 'Copyright (c) 2026 Matt Pocock' || fail "T9 copyright"
printf '%s\n' "$section" | grep -Fq 'improve-codebase-architecture' || fail "T9 upstream skill"

[ "$(grep -c 'skills: survey · agents: explorer · scripts, docs, tests' README.md)" -eq 1 ] || fail "T10 tree skills listing"

want='├── context-flow/,├── deepen/,├── diagnose/'
got="$(grep -oE '^├── (context-flow|deepen|diagnose)/' README.md | paste -sd, -)"
[ "$got" = "$want" ] || fail "T11 tree order: got $got"

tmp="$(mktemp)"
awk '
  /^├── deepen\// { deep=$0; next }
  /^├── diagnose\// { print; if (deep != "") print deep; next }
  { print }
' README.md > "$tmp"
mut="$(grep -oE '^├── (context-flow|deepen|diagnose)/' "$tmp" | paste -sd, -)"
rm -f "$tmp"
[ "$mut" != "$want" ] || fail "T11 negative control should mismatch"
