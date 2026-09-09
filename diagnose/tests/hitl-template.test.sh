#!/usr/bin/env bash
# HITL template: parses, and the helpers/markers/KEY=VALUE tail are intact.
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1"; exit 1; }

f=diagnose/scripts/hitl-loop.template.sh

bash -n "$f" || fail "T1 bash -n"
[ "$(grep -c '^step() {' "$f")" = 1 ] || fail "T2 step()"
[ "$(grep -c '^capture() {' "$f")" = 1 ] || fail "T3 capture()"
[ "$(grep -c -- '--- edit below' "$f")" = 1 ] || fail "T4 edit below"
[ "$(grep -c -- '--- edit above' "$f")" = 1 ] || fail "T4 edit above"
[ "$(grep -c "printf 'ERRORED=%s" "$f")" = 1 ] || fail "T5 ERRORED KEY=VALUE"
[ "$(grep -c '^set -euo pipefail$' "$f")" = 1 ] || fail "T6 set -euo pipefail"

echo "ok - hitl-template.test.sh"
