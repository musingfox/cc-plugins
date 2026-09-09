#!/usr/bin/env bash
# Guard: the run ends with a paste-ready hand-off a person can act on.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n=$(grep -c '^Branch:' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T1: expected Branch: at column 0"

n=$(grep -c '^Cause:' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T2: expected Cause: at column 0"

n=$(grep -ci 'cherry-pick' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T3: expected cherry-pick"

n=$(grep -ci 'do not check it out' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T4: expected do not check it out"

n=$(grep -cF '.diagnose/<slug>.patch' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T5: expected .diagnose/<slug>.patch"

n=$(grep -c '/cf ' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T6: expected a paste-ready /cf line"

n=$(grep -ci 'print nothing' diagnose/docs/method.md || true)
[ "$n" -eq 0 ] || fail "T7: blanket 'print nothing' must be gone"

n=$(grep -cF 'Print the hand-off only once the commit exists' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T8: expected the scoped hand-off print rule once, got $n"

n=$(grep -i 'commit exists' diagnose/docs/method.md | grep -vci 'hand-off' || true)
[ "$n" -eq 0 ] || fail "T9: every commit-exists output rule must name the hand-off"
