#!/usr/bin/env bash
# Pins the two-axis Phase 4 review split.

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

ROOT="$(cd "$CF_TESTS_DIR/../.." && pwd)"
REVIEW="$ROOT/context-flow/agents/review.md"
CFMD="$ROOT/context-flow/commands/cf.md"
PI_REVIEWER="$ROOT/pi-dispatch/agents/reviewer.md"

assert_ge1() {
  local n="$1" msg="$2"
  if [ "${n:-0}" -ge 1 ]; then
    assert_eq "ge1" "ge1" "$msg"
  else
    assert_eq ">=1" "$n" "$msg"
  fi
}

# IsolationPreserved T1
tools_line=$(grep -E '^tools:' "$REVIEW")
assert_eq "tools: Read, Write, Grep, Glob, Bash" "$tools_line" "review.md tools whitelist"

# IsolationPreserved T2
if grep -h '^tools:' "$PI_REVIEWER" "$REVIEW" | grep -qw Edit; then
  assert_eq "no-Edit" "has-Edit" "neither review seat lists Edit"
else
  assert_eq "no-Edit" "no-Edit" "neither review seat lists Edit"
fi

# IsolationPreserved T3
bt_line=$(grep -F 'builder transcript' "$REVIEW" | grep -F 'forbidden' || true)
if [ -n "$bt_line" ]; then
  assert_eq "ge1" "ge1" "builder transcript is forbidden"
else
  assert_eq "present" "absent" "builder transcript is forbidden"
fi

# IsolationPreserved T4
assert_ge1 "$(grep -cF 'model: opus' "$REVIEW" || true)" "review.md has model: opus"
assert_ge1 "$(grep -cF 'capability floor' "$REVIEW" || true)" "review.md has capability floor"

heading_line() {
  grep -n -m1 "^$2" "$1" | cut -d: -f1
}

# AxisSelection T1
assert_ge1 "$(grep -cF '## Axis: Standards' "$REVIEW" || true)" "review.md names ## Axis: Standards"
assert_ge1 "$(grep -cF '## Axis: Spec' "$REVIEW" || true)" "review.md names ## Axis: Spec"

# AxisSelection T2
axis_blocker=$(grep -F 'missing or unknown axis' "$REVIEW" | grep -F 'Blocker' || true)
if [ -n "$axis_blocker" ]; then
  assert_eq "ge1" "ge1" "missing or unknown axis is a Blocker"
else
  assert_eq "present" "absent" "missing or unknown axis is a Blocker"
fi

# AxisSelection T3
std_h=$(heading_line "$REVIEW" '## Standards Axis')
spec_h=$(heading_line "$REVIEW" '## Spec Axis')
rules_h=$(heading_line "$REVIEW" '## Rules')
if [ -n "$std_h" ] && [ -n "$spec_h" ] && [ -n "$rules_h" ] && [ "$std_h" -lt "$spec_h" ] && [ "$spec_h" -lt "$rules_h" ]; then
  assert_eq "order" "order" "Standards Axis before Spec Axis before Rules"
else
  assert_eq "std<spec<rules" "$std_h,$spec_h,$rules_h" "Standards Axis before Spec Axis before Rules"
fi

# AxisSelection T4
fm=$(sed -n '1,10p' "$REVIEW")
assert_contains "$fm" 'name: review' "frontmatter name: review"

range_awk() {
  awk -v s="$2" -v e="$3" '$0 ~ s {p=1} p {print} $0 ~ e && p {exit}' "$1"
}

phase4() {
  range_awk "$CFMD" '^## Phase 4: Review' '^## Context Compression'
}

# TwoAxisFanOut T1
assert_eq "2" "$(phase4 | grep -cF 'subagent_type: "cf:review"' || true)" "Phase 4 dispatches cf:review twice"

# TwoAxisFanOut T2
assert_ge1 "$(phase4 | grep -cF 'Report path: $SESSION/review-standards.md' || true)" "Phase 4 has standards report path"
assert_ge1 "$(phase4 | grep -cF 'Report path: $SESSION/review-spec.md' || true)" "Phase 4 has spec report path"

# TwoAxisFanOut T3
assert_eq "0" "$(grep -cF '$SESSION/review.md' "$CFMD" || true)" "cf.md has no \$SESSION/review.md"
assert_eq "0" "$(grep -cF 'Dispatch a single review agent' "$CFMD" || true)" "cf.md does not dispatch a single review agent"

# TwoAxisFanOut T4
assert_ge1 "$(phase4 | grep -cF 'single message' || true)" "Phase 4 launches both in a single message"
assert_ge1 "$(phase4 | grep -cF 'read-only' || true)" "Phase 4 reviews are read-only"

standards_block() {
  awk '
    /Report path: \$SESSION\/review-standards.md/ {p=1}
    /Report path: \$SESSION\/review-spec.md/ {exit}
    p {print}
  ' "$CFMD"
}

spec_block() {
  awk '
    /Report path: \$SESSION\/review-spec.md/ {p=1}
    /^### Presenting Results/ {exit}
    p {print}
  ' "$CFMD"
}

# AxisBriefIsolation T1
sb=$(standards_block)
assert_ge1 "$(printf '%s\n' "$sb" | grep -cF '## Axis: Standards' || true)" "standards block has ## Axis: Standards"
assert_ge1 "$(printf '%s\n' "$sb" | grep -cF '## Implement Concerns' || true)" "standards block has ## Implement Concerns"
assert_ge1 "$(printf '%s\n' "$sb" | grep -cF '## Convention sources' || true)" "standards block has ## Convention sources"
assert_eq "0" "$(printf '%s\n' "$sb" | grep -cF '## Behavioral Contracts' || true)" "standards block has no Behavioral Contracts"
assert_eq "0" "$(printf '%s\n' "$sb" | grep -cF 'review-spec.md' || true)" "standards block has no review-spec.md"

# AxisBriefIsolation T2
spb=$(spec_block)
assert_ge1 "$(printf '%s\n' "$spb" | grep -cF '## Axis: Spec' || true)" "spec block has ## Axis: Spec"
assert_ge1 "$(printf '%s\n' "$spb" | grep -cF '## Behavioral Contracts' || true)" "spec block has ## Behavioral Contracts"
assert_ge1 "$(printf '%s\n' "$spb" | grep -cF '## Test Cases' || true)" "spec block has ## Test Cases"
assert_eq "0" "$(printf '%s\n' "$spb" | grep -cF 'Implement Concerns' || true)" "spec block has no Implement Concerns"
assert_eq "0" "$(printf '%s\n' "$spb" | grep -cF 'review-standards.md' || true)" "spec block has no review-standards.md"

# AxisBriefIsolation T3
p4=$(phase4)
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'Do NOT pass' || true)" "Phase 4 says Do NOT pass"
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'research constraints' || true)" "Phase 4 mentions research constraints"
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'Do NOT inline' || true)" "Phase 4 says Do NOT inline"

# AxisBriefIsolation T4
assert_eq "0" "$(printf '%s\n' "$sb" | grep -cF '~/.claude/CLAUDE.md' || true)" "standards dispatch never cites ~/.claude/CLAUDE.md"

# DiffCaptured T1
p4=$(phase4)
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'integration_branch' || true)" "Phase 4 names integration_branch"
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'implement.diff' || true)" "Phase 4 names implement.diff"

# DiffCaptured T2
assert_eq "0" "$(grep -cF 'written by the integration gate' "$CFMD" || true)" "cf.md does not say written by the integration gate"
assert_eq "0" "$(grep -cF 'Diff path is' "$CFMD" || true)" "cf.md does not say Diff path is"

# DiffCaptured T3
assert_eq "0" "$(printf '%s\n' "$p4" | grep -cF '${BASE_HEAD:-HEAD}' || true)" "Phase 4 does not fallback BASE_HEAD to HEAD"

# DiffCaptured T4
assert_eq "0" "$(printf '%s\n' "$p4" | grep -cE 'diff .*\.\.\.' || true)" "Phase 4 does not use three-dot git diff"

# DiffCaptured T5
ng=$(printf '%s\n' "$p4" | grep -F 'non-git scratch mode' | grep -F ': >' || true)
if [ -n "$ng" ]; then
  assert_eq "ge1" "ge1" "empty diff write is on the non-git scratch mode line"
else
  assert_eq "present" "absent" "empty diff write is on the non-git scratch mode line"
fi
