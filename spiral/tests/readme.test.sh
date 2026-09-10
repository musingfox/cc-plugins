#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n="$(grep -c 'commands: spiral · agents: divergence, probe, prototype · scripts · tests' README.md || true)"
[ "$n" -eq 1 ] || fail "root README spiral tree line count is $n, want 1"

order="$(grep -oE '^├── (pi-dispatch|spec|spiral)/' README.md | paste -sd, -)"
[ "$order" = '├── pi-dispatch/,├── spec/,├── spiral/' ] || fail "tree order is $order"
