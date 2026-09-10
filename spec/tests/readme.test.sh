#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n="$(grep -c 'skills: spec, glossary · scripts: spec.sh · tests' README.md || true)"
[ "$n" -eq 1 ] || fail "root README spec tree line count is $n, want 1"

section="$(awk '/^### Spec/,/^### agent-browser/' README.md)"
n="$(printf '%s\n' "$section" | grep -c 'CONTEXT.md' || true)"
[ "$n" -ge 1 ] || fail "Spec section must mention CONTEXT.md"
n="$(printf '%s\n' "$section" | grep -cF '/spec:glossary' || true)"
[ "$n" -ge 1 ] || fail "Spec section must mention /spec:glossary"

order="$(grep -oE '^├── (pi-dispatch|spec|spiral)/' README.md | paste -sd, -)"
[ "$order" = '├── pi-dispatch/,├── spec/,├── spiral/' ] || fail "tree order is $order"

n="$(grep -c 'CONTEXT.md' spec/README.md || true)"
[ "$n" -ge 1 ] || fail "spec/README.md must mention CONTEXT.md"
n="$(grep -c 'glossary' spec/README.md || true)"
[ "$n" -ge 1 ] || fail "spec/README.md must mention glossary"

moved="$(awk '
  /^├── spec\// { spec = $0; next }
  /^├── spiral\// { print; if (spec != "") print spec; spec = ""; next }
  { print }
' README.md)"
moved_order="$(printf '%s\n' "$moved" | grep -oE '^├── (pi-dispatch|spec|spiral)/' | paste -sd, -)"
[ "$moved_order" != "$order" ] || fail "moving spec after spiral must change tree order"
