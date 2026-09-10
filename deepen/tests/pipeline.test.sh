#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

f=deepen/skills/survey/SKILL.md
[ -f "$f" ] || fail "SKILL.md missing"

n=$(grep -c 'Agent(subagent_type: "deepen:explorer"' "$f" || true)
[ "$n" -ge 1 ] || fail "T1: Agent dispatch, got $n"

n=$(grep -cF "sed -n '/^## Summary/,/^## Notes/p'" "$f" || true)
[ "$n" -ge 1 ] || fail "T2: bounded sed, got $n"

for p in 'docs/report.md' 'render-survey.sh' '/tmp/viz/'; do
  n=$(grep -c "$p" "$f" || true)
  [ "$n" -ge 1 ] || fail "T3: '$p' missing"
done

n=$(grep -c 'deepen-explorer-' "$f" || true)
[ "$n" -ge 1 ] || fail "T4: deepen-explorer-, got $n"

n=$(grep -c 'at most three' "$f" || true)
[ "$n" -ge 1 ] || fail "T5: at most three, got $n"

n=$(grep -c 'Which of these would you like to explore?' "$f" || true)
[ "$n" -eq 1 ] || fail "T6: hand-off question must be 1, got $n"

n=$(grep -c 'No candidates' "$f" || true)
[ "$n" -ge 1 ] || fail "T7: No candidates, got $n"

n=$(grep -c '/spiral' "$f" || true)
[ "$n" -ge 1 ] || fail "T8: /spiral, got $n"

n=$(grep -c 'Do NOT propose interfaces' "$f" || true)
[ "$n" -ge 1 ] || fail "T9: Do NOT propose interfaces, got $n"

n=$(grep -ciE '<svg|<html|<div' "$f" || true)
[ "$n" -eq 0 ] || fail "T10: html/svg/div must be 0, got $n"
