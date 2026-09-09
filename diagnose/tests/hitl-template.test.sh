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

# The usage comment is what a person reads when they copy the file; it must
# not tell them the agent runs it — the agent's shell has nobody at the keyboard.
[ "$(grep -c 'The agent runs the script' "$f")" = 0 ] || fail "T7 comment must not say the agent runs it"
[ "$(grep -c '^# The user runs the script in their own terminal' "$f")" = 1 ] || fail "T7 comment must say the user runs it"
[ "$(grep -c 'never executes it' "$f")" = 1 ] || fail "T7 comment must forbid agent execution"
[ "$(head -9 "$f" | grep -c 'usage line below')" = 1 ] || fail "T8 header must declare the usage-line edit"

echo "ok - hitl-template.test.sh"
