#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

[ "$(grep -c '^### Diagnose$' README.md)" -eq 1 ] || fail "T1 ### Diagnose heading"
[ "$(grep -c '/plugin install diagnose' README.md)" -eq 1 ] || fail "T2 install command"
[ "$(grep -c 'Copyright (c) 2026 Matt Pocock' README.md)" -ge 2 ] || fail "T3 Matt Pocock copyright"

want='├── context-flow/,├── diagnose/,├── fizzy/'
got="$(grep -oE '^├── (context-flow|diagnose|fizzy)/' README.md | paste -sd, -)"
[ "$got" = "$want" ] || fail "T4 tree order: got $got"

tmp="$(mktemp)"
awk '
  /^├── diagnose\// { diag=$0; next }
  /^├── fizzy\// { print; if (diag != "") print diag; next }
  { print }
' README.md > "$tmp"
mut="$(grep -oE '^├── (context-flow|diagnose|fizzy)/' "$tmp" | paste -sd, -)"
rm -f "$tmp"
[ "$mut" != "$want" ] || fail "T5 negative control should mismatch"

[ "$(grep -c 'skills: diagnose, diagnose-now' README.md)" -eq 1 ] || fail "T6 skills listing"
[ "$(grep -ci 'read from, not something to check out' README.md)" -ge 1 ] || fail "T7 read-not-checkout"

[ "$(head -3 diagnose/tests/readme.test.sh | grep -Fc 'cd "$(git rev-parse --show-toplevel)"')" -eq 1 ] || fail "T8 anchored cd"

echo "ok - readme.test.sh"
