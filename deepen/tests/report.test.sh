#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

f=deepen/docs/report.md
[ -f "$f" ] || fail "report.md missing"

for p in \
  '## Top recommendation' \
  '**Strength**' \
  'Strong' \
  'Worth exploring' \
  'Speculative' \
  '**Files**' \
  '**Problem**' \
  '**Solution**' \
  '**Wins**' \
  '**Before**' \
  '**After**' \
  'contradicts ADR'
do
  n=$(grep -cF -- "$p" "$f" || true)
  [ "$n" -ge 1 ] || fail "T1: '$p' missing"
done

n=$(grep -c '^```mermaid' "$f" || true)
[ "$n" -ge 2 ] || fail "T2: mermaid fences, got $n"

n=$(grep -ciE '<svg|<html|<div' "$f" || true)
[ "$n" -eq 0 ] || fail "T3: html/svg/div must be 0, got $n"

n=$(grep -c 'redraw the diagram' "$f" || true)
[ "$n" -ge 1 ] || fail "T4: redraw the diagram, got $n"

n=$(grep -c 'Use exactly:' "$f" || true)
[ "$n" -eq 1 ] || fail "T5: Use exactly: must be 1, got $n"
