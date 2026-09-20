#!/usr/bin/env bash
# The pane reads the dashboard, so no legacy search export may be named in it.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

register=obsidian-workspace/hooks/register.ts

grep -qF 'baseQueryArgv' "$register" || fail "T1: register.ts does not name baseQueryArgv, so this read missed the real file"

for name in listArgv cardArgv searchOutput; do
  grep -qF "$name" "$register" && fail "T2: register.ts still names $name"
done
exit 0
