#!/usr/bin/env bash
# Guard: no honest test seam still hands back a runnable minimised repro.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

range=$(awk '/^## Phase 5/,/^## Phase 6/' diagnose/docs/method.md)

n=$(printf '%s\n' "$range" | grep -ci 'no correct seam' || true)
[ "$n" -ge 1 ] || fail "T1: expected no correct seam in Phase 5"

n=$(printf '%s\n' "$range" | grep -ci 'minimised repro' || true)
[ "$n" -ge 1 ] || fail "T2: expected minimised repro in Phase 5"

n=$(printf '%s\n' "$range" | grep -ci 'debug location' || true)
[ "$n" -ge 1 ] || fail "T3: expected debug location in Phase 5"

n=$(grep -c 'Repro:' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T4: expected Repro: label"
