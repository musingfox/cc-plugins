#!/usr/bin/env bash
# Guard: secrets are named as <REDACTED> before anything is shown.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n=$(grep -c '^## Redact$' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T1: expected one ## Redact heading, got $n"

range=$(awk '/^## Redact$/,/^## Phase 1/' diagnose/docs/method.md)

n=$(printf '%s\n' "$range" | grep -c '<REDACTED>' || true)
[ "$n" -ge 1 ] || fail "T2: expected <REDACTED> in the Redact section"

n=$(printf '%s\n' "$range" | grep -ci 'env var' || true)
[ "$n" -ge 1 ] || fail "T3: expected env var in the Redact section"

n=$(printf '%s\n' "$range" | grep -ci 'ask the user' || true)
[ "$n" -ge 1 ] || fail "T4: expected ask the user in the Redact section"
