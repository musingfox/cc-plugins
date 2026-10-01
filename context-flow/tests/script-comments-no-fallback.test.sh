#!/usr/bin/env bash
# Script and test comments do not point at a Claude fallback in cf.md §3.6 (now the OMP overflow).
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd)"

hits=$(grep -rniE 'claude[- ]fallback' "$CF_ROOT/scripts" "$CF_TESTS_DIR/scope-prereq.test.sh" || true)
assert_eq "" "$hits" "T1 no script or scope-prereq comment names a Claude fallback"
