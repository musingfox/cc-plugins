#!/usr/bin/env bash
# Guard: Phases 1–4 still define every input a later phase consumes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

loops=$(awk '/^### Ways to construct one/,/^Build the right feedback loop/' diagnose/docs/method.md)

n=$(printf '%s\n' "$loops" | grep -cE '^[0-9]+\. \*\*' || true)
[ "$n" -eq 10 ] || fail "T1: expected 10 constructions, got $n"

titles=$(printf '%s\n' "$loops" | grep -oE '^[0-9]+\. \*\*[^*]+\*\*')
expected=$'1. **Failing test**\n2. **Curl / HTTP script**\n3. **CLI invocation**\n4. **Headless browser script**\n5. **Replay a captured trace**\n6. **Throwaway harness**\n7. **Property / fuzz loop**\n8. **Bisection harness**\n9. **Differential loop**\n10. **HITL bash script**'
[ "$titles" = "$expected" ] || fail "T2: construction titles out of order"$'\n'"$titles"

n=$(printf '%s\n' "$loops" | grep -c 'CLAUDE_PLUGIN_ROOT' || true)
[ "$n" -eq 0 ] || fail "T3: method.md must not name CLAUDE_PLUGIN_ROOT"

seq=$(grep -oE '^## Phase [0-6]' diagnose/docs/method.md | paste -sd, -)
[ "$seq" = '## Phase 0,## Phase 1,## Phase 2,## Phase 3,## Phase 4,## Phase 5,## Phase 6' ] \
  || fail "T4: phase heading sequence was $seq"

n=$(grep -cE '^### (Tighten the loop|Non-deterministic bugs|When you genuinely cannot build a loop|Completion criterion)' diagnose/docs/method.md || true)
[ "$n" -eq 4 ] || fail "T5: expected Phase 1's four subsections, got $n"

crit=$(awk '/^### Completion criterion/,/^## Phase 2/' diagnose/docs/method.md)

n=$(printf '%s\n' "$crit" | grep -cE '^- \[ \] \*\*' || true)
[ "$n" -eq 4 ] || fail "T6: expected 4 completion checkboxes, got $n"

boxes=$(printf '%s\n' "$crit" | grep -oE '^- \[ \] \*\*[^*]+\*\*')
expected_boxes=$'- [ ] **Red-capable**\n- [ ] **Deterministic**\n- [ ] **Fast**\n- [ ] **Agent-runnable**'
[ "$boxes" = "$expected_boxes" ] || fail "T7: checkbox titles out of order"$'\n'"$boxes"

n=$(grep -cF 'No red-capable command, no Phase 2' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T8: expected the hard gate once, got $n"

n=$(grep -ci 'jumping straight to a hypothesis' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T9: expected stop-before-theorising guardrail"

n=$(printf '%s\n' "$crit" | grep -cF 'scripts/hitl-loop.template.sh' || true)
[ "$n" -eq 0 ] || fail "T10: completion criterion must not name the literal HITL path"

n=$(grep -c '^### Minimise$' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T11: expected ### Minimise"

n=$(awk '/^### Minimise$/,/^## Phase 3/' diagnose/docs/method.md | grep -ci 'load-bearing' || true)
[ "$n" -ge 1 ] || fail "T12: Minimise must define load-bearing"

n=$(awk '/^## Phase 3/,/^## Phase 4/' diagnose/docs/method.md | grep -ci 'falsifiable' || true)
[ "$n" -ge 1 ] || fail "T13: Phase 3 must require falsifiable hypotheses"

n=$(awk '/^## Phase 4/,/^## Phase 5/' diagnose/docs/method.md | grep -cF '[DEBUG-' || true)
[ "$n" -ge 1 ] || fail "T14: Phase 4 must introduce [DEBUG-"

rc_line=$(grep -n 'red-capable' diagnose/docs/method.md | head -1 | cut -d: -f1)
ho_line=$(grep -n '^## Hand-off' diagnose/docs/method.md | head -1 | cut -d: -f1)
[ -n "$rc_line" ] && [ -n "$ho_line" ] && [ "$rc_line" -lt "$ho_line" ] \
  || fail "T15: red-capable must be defined before Hand-off (rc=$rc_line ho=$ho_line)"
