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

phase4_line() {
  awk '/^## Phase 4: Review/{p=1} p{print} /^## Context Compression/{exit}' "$CFMD" | grep -n -F -- "$1" | head -1 | cut -d: -f1
}

# DiffNonEmpty T1
assert_ge1 "$(phase4 | grep -cF -- '-s "$SESSION/implement.diff"' || true)" "Phase 4 tests implement.diff with -s"

# DiffNonEmpty T2
empty_ln=$(awk '/^## Phase 4: Review/{p=1} p{print} /^## Context Compression/{exit}' "$CFMD" | grep -n -F -- '-s "$SESSION/implement.diff"' | head -1 | cut -d: -f1)
agent_ln=$(phase4_line 'Agent(')
if [ -n "$empty_ln" ] && [ -n "$agent_ln" ] && [ "$empty_ln" -lt "$agent_ln" ]; then
  assert_eq "order" "order" "empty-diff check precedes Agent("
else
  assert_eq "empty<agent" "$empty_ln,$agent_ln" "empty-diff check precedes Agent("
fi

# DiffNonEmpty T3
assert_ge1 "$(phase4 | grep -cF 'implement.diff is empty' || true)" "Phase 4 names an empty implement.diff"

phase4_revparse_before_agent() {
  local f="$1"
  local range rp ag
  range=$(awk '/^## Phase 4: Review/{p=1} p{print} /^## Context Compression/{exit}' "$f")
  rp=$(printf '%s\n' "$range" | grep -n -m1 -F 'rev-parse' | cut -d: -f1)
  ag=$(printf '%s\n' "$range" | grep -n -m1 -F 'Agent(' | cut -d: -f1)
  [ -n "$rp" ] && [ -n "$ag" ] && [ "$rp" -lt "$ag" ]
}

# FixedPointResolves T1
assert_ge1 "$(phase4 | grep -cF 'rev-parse' || true)" "Phase 4 uses rev-parse"
assert_ge1 "$(phase4 | grep -cF -- '--verify' || true)" "Phase 4 uses --verify"

# FixedPointResolves T2
if phase4_revparse_before_agent "$CFMD"; then
  assert_eq "order" "order" "rev-parse precedes Agent("
else
  assert_eq "rev-parse<agent" "fail" "rev-parse precedes Agent("
fi

# FixedPointResolves T3
NEG=$(mktemp -d)
awk '{print} /^## Phase 4: Review$/{print "Agent("}' "$CFMD" > "$NEG/cf.md"
if phase4_revparse_before_agent "$NEG/cf.md"; then
  assert_eq "fail" "pass" "injected Agent( after Phase 4 heading fails ordering helper"
else
  assert_eq "fail" "fail" "injected Agent( after Phase 4 heading fails ordering helper"
fi
if phase4_revparse_before_agent "$CFMD"; then
  assert_eq "pass" "pass" "unmodified cf.md still passes ordering helper"
else
  assert_eq "pass" "fail" "unmodified cf.md still passes ordering helper"
fi
rm -rf "$NEG"
if [ ! -d "$NEG" ]; then
  assert_eq "gone" "gone" "negative-control temp dir is removed"
else
  assert_eq "absent" "present" "negative-control temp dir is removed"
fi

# FixedPointResolves T4
assert_ge1 "$(phase4 | grep -cF 'Phase 4 fail-early:' || true)" "Phase 4 fail-early prefix"
assert_ge1 "$(phase4 | grep -cF 'integration branch missing' || true)" "Phase 4 names integration branch missing"

# ScratchModeSkip T1
assert_ge1 "$(phase4 | grep -cF 'fail-early skipped (non-git scratch mode)' || true)" "scratch mode skips fail-early"

# ScratchModeSkip T2
assert_ge1 "$(phase4 | grep -cF -- '-n "${REPO_ROOT:-}"' || true)" "fail-early is guarded by REPO_ROOT"

presenting() {
  range_awk "$CFMD" '^### Presenting Results' '^### Handling the Verdict'
}

handling() {
  range_awk "$CFMD" '^### Handling the Verdict' '^### Post-PASS spec maintenance'
}

outdisc() {
  range_awk "$CFMD" '^### Agent Output Discipline' '^## Phase 1'
}

# SideBySidePresent T1
pr=$(presenting)
assert_ge1 "$(printf '%s\n' "$pr" | grep -cF '## Standards' || true)" "Presenting has ## Standards"
assert_ge1 "$(printf '%s\n' "$pr" | grep -cF '## Spec' || true)" "Presenting has ## Spec"
assert_ge1 "$(printf '%s\n' "$pr" | grep -cF 'rerank' || true)" "Presenting forbids rerank"
assert_ge1 "$(printf '%s\n' "$pr" | grep -cF 'No findings.' || true)" "Presenting has No findings."

# SideBySidePresent T2
hd=$(handling)
assert_ge1 "$(printf '%s\n' "$hd" | grep -cF 'Spec verdict' || true)" "Handling routes on Spec verdict"
assert_ge1 "$(printf '%s\n' "$hd" | grep -cF 'documented-convention violation' || true)" "Handling mentions documented-convention violation"

# SideBySidePresent T3
assert_ge1 "$(outdisc | grep -cF 'review-spec.md' || true)" "Output Discipline names review-spec.md"

# SideBySidePresent T4
assert_ge1 "$(printf '%s\n' "$pr" | grep -cF 'review-standards.md' || true)" "Presenting names review-standards.md"
assert_ge1 "$(printf '%s\n' "$pr" | grep -cF 'review-spec.md' || true)" "Presenting names review-spec.md"

# NoSpecEscalation T1–T2
nospec_line=$(handling | grep -F 'no spec available' | grep -F 'AskUserQuestion' || true)
if [ -n "$nospec_line" ]; then
  assert_eq "ge1" "ge1" "Handling sends no spec available to AskUserQuestion"
else
  assert_eq "present" "absent" "Handling sends no spec available to AskUserQuestion"
fi
assert_eq "0" "$(printf '%s\n' "$nospec_line" | grep -cF 're-run implement' || true)" "no-spec line does not re-run implement"
assert_eq "0" "$(printf '%s\n' "$nospec_line" | grep -cF 'retries_used' || true)" "no-spec line does not increment retries_used"

spec_range() {
  range_awk "$REVIEW" '^## Spec Axis' '^## Rules'
}

standards_range() {
  range_awk "$REVIEW" '^## Standards Axis' '^## Spec Axis'
}

rules_range() {
  awk '/^## Rules/{p=1} p{print}' "$REVIEW"
}

# NoSpecAvailable T1
assert_ge1 "$(spec_range | grep -cF 'no spec available' || true)" "Spec axis mentions no spec available"
nsa=$(spec_range | grep -cF 'no spec available' || true)
if [ "$nsa" -ge 2 ]; then
  assert_eq "ge2" "ge2" "Spec axis says no spec available at least twice"
else
  assert_eq ">=2" "$nsa" "Spec axis says no spec available at least twice"
fi

# NoSpecAvailable T2
nsa_blocker=$(spec_range | grep -F 'no spec available' | grep -F 'Blocker' || true)
if [ -n "$nsa_blocker" ]; then
  assert_eq "ge1" "ge1" "no spec available is a Blocker"
else
  assert_eq "present" "absent" "no spec available is a Blocker"
fi

# NoSpecAvailable T3
assert_ge1 "$(spec_range | grep -cF 'never infer' || true)" "Spec axis never infers a spec from the diff"

# SpecReportShape T1
sr=$(spec_range)
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'missing or partial' || true)" "Spec FAIL: missing or partial"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'scope creep' || true)" "Spec FAIL: scope creep"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'implemented but wrong' || true)" "Spec FAIL: implemented but wrong"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'quote the contract' || true)" "Spec FAIL quotes the contract"

# SpecReportShape T2
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF '## Verdict' || true)" "Spec range has ## Verdict"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'APPROVE-with-advisories' || true)" "Spec range has APPROVE-with-advisories"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'REQUEST_CHANGES' || true)" "Spec range has REQUEST_CHANGES"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF '## What Changed' || true)" "Spec range has ## What Changed"
assert_ge1 "$(printf '%s\n' "$sr" | grep -cF 'fuzzy_criteria' || true)" "Spec range has fuzzy_criteria"

# SpecReportShape T3
rr=$(rules_range)
assert_ge1 "$(printf '%s\n' "$rr" | grep -cF 'Verdict enum is exact' || true)" "Rules: Verdict enum is exact"
assert_ge1 "$(printf '%s\n' "$rr" | grep -cF 'You do NOT receive research constraints' || true)" "Rules: no research constraints"

# StandardsReportShape T1
st=$(standards_range)
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'documented-convention violation' || true)" "Standards: documented-convention violation"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'baseline smell' || true)" "Standards: baseline smell"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'Implement Concerns' || true)" "Standards: Implement Concerns"

# StandardsReportShape T2
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'never emits a `## Verdict`' || true)" "Standards never emits a Verdict"

# StandardsReportShape T3
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'documented-convention violations:' || true)" "Standards list heading documented-convention violations:"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'baseline smells:' || true)" "Standards list heading baseline smells:"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'No findings.' || true)" "Standards empty state No findings."

# StandardsSources T1
st=$(standards_range)
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'CLAUDE.md' || true)" "Standards sources include CLAUDE.md"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'docs/' || true)" "Standards sources include docs/"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'status: accepted' || true)" "Standards sources include status: accepted"

# StandardsSources T2
glob=$(printf '%s\n' "$st" | grep -F '~/.claude/CLAUDE.md' | grep -F 'never' || true)
if [ -n "$glob" ]; then
  assert_eq "ge1" "ge1" "~/.claude/CLAUDE.md is never a source"
else
  assert_eq "present" "absent" "~/.claude/CLAUDE.md is never a source"
fi

# StandardsSources T3
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'cite the file and the rule' || true)" "Standards findings cite the file and the rule"

# SmellBaselinePrecedence T1
st=$(standards_range)
for smell in \
  '**Mysterious Name**' '**Duplicated Code**' '**Feature Envy**' '**Data Clumps**' \
  '**Primitive Obsession**' '**Repeated Switches**' '**Shotgun Surgery**' \
  '**Divergent Change**' '**Speculative Generality**' '**Message Chains**' \
  '**Middle Man**' '**Refused Bequest**'; do
  assert_ge1 "$(printf '%s\n' "$st" | grep -cF "$smell" || true)" "Standards baseline has $smell"
done

# SmellBaselinePrecedence T2
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'Fowler' || true)" "Standards cites Fowler"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'Refactoring' || true)" "Standards cites Refactoring"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'ch. 3' || true)" "Standards cites ch. 3"

# SmellBaselinePrecedence T3
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'A documented repo convention always wins' || true)" "repo convention always wins"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'judgement call' || true)" "each smell is a judgement call"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'tooling already enforces' || true)" "skip what tooling already enforces"

# SmellBaselinePrecedence T4
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'repo convention > baseline' || true)" "repo convention > baseline"

# UpstreamAttribution T1
st=$(standards_range)
for phrase in \
  'https://github.com/mattpocock/skills' \
  '`code-review`' \
  'MIT' \
  'Copyright (c) 2026 Matt Pocock' \
  '3cca18b368ae95cdbdebbff572ccafa662551015'; do
  assert_ge1 "$(printf '%s\n' "$st" | grep -cF "$phrase" || true)" "Standards attribution has $phrase"
done

# UpstreamAttribution T2
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'not imported' || true)" "Standards records what was not imported"
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'issue-tracker' || true)" "Standards records issue-tracker was not imported"

# --- Review-round fixes: each clause below was a FAIL that the assertions above did not cover.

line_of() {
  printf '%s\n' "$1" | grep -n -m1 -F -- "$2" | cut -d: -f1
}

assert_before() {
  local a="$1" b="$2" msg="$3"
  if [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ]; then
    assert_eq "order" "order" "$msg"
  else
    assert_eq "a<b" "$a,$b" "$msg"
  fi
}

# AxisSelection T5: the Spec-shaped body sits under ## Spec Axis, after ## Standards Axis
rv=$(cat "$REVIEW")
spec_h=$(line_of "$rv" '## Spec Axis')
assert_before "$(line_of "$rv" '## Standards Axis')" "$(line_of "$rv" '## Contract Verification')" "Spec schema comes after the Standards brief"
assert_before "$spec_h" "$(line_of "$rv" '## Contract Verification')" "Spec schema is under ## Spec Axis"
assert_before "$spec_h" "$(line_of "$rv" 'MUST appear')" "Verdict-must-appear rule is under ## Spec Axis"
assert_before "$spec_h" "$(line_of "$rv" 'Verify that the implementation satisfies every behavioral contract')" "contract-verification mandate is under ## Spec Axis"
st=$(standards_range)
assert_eq "0" "$(printf '%s\n' "$st" | grep -cF '## Contract Verification' || true)" "Standards range has no Contract Verification"
assert_eq "0" "$(printf '%s\n' "$st" | grep -vF 'never emits' | grep -cF '## Verdict' || true)" "Standards range mentions ## Verdict only to forbid it"
sr=$(spec_range)
assert_before "$(line_of "$sr" 'Spec brief — selected')" "$(line_of "$sr" 'no spec available')" "Spec scope marker precedes the no-spec rule"

# NoSpecAvailable T4: the blocked report's shape is fully specified
assert_ge1 "$(printf '%s\n' "$sr" | grep -F '`## Contract Verification`' | grep -F 'single line' | grep -cF 'no spec available' || true)" "Contract Verification body is the single line no spec available"
assert_ge1 "$(printf '%s\n' "$sr" | grep -F '`## What Changed`' | grep -cF 'omit' || true)" "What Changed is omitted under no spec available"
assert_ge1 "$(printf '%s\n' "$sr" | grep -F 'no spec available' | grep -cF 'REQUEST_CHANGES' || true)" "no spec available verdict is REQUEST_CHANGES"

# StandardsReportShape T4: the Standards axis has its own report schema and reply shape
for token in '## Findings' '- **Label**' '- **Where**' '- **Detail**' '## Implement Concerns' '## Completed' '## Unresolved' \
  'Report written:' '## Standards summary' 'documented-convention violations: N' 'baseline smells: M' 'agree' 'disagree'; do
  assert_ge1 "$(printf '%s\n' "$st" | grep -cF -- "$token" || true)" "Standards report shape has $token"
done
assert_before "$(line_of "$st" '### Documented-convention violations')" "$(line_of "$st" '### Baseline smells')" "Standards schema lists violations before smells"
assert_ge1 "$(printf '%s\n' "$st" | grep -F 'report file' | grep -cF 'reply' || true)" "Standards says which shape is the file and which is the reply"

# SmellBaselinePrecedence T5: every finding quotes the hunk
assert_ge1 "$(printf '%s\n' "$st" | grep -cF 'quoting the hunk' || true)" "Standards findings quote the hunk"

# FixedPointResolves T5: integration branch is read from integration-result.json, never re-derived
p4=$(phase4)
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'Phase 4 fail-early: integration branch missing from integration-result.json' || true)" "exact integration-result.json fail-early line"
assert_ge1 "$(printf '%s\n' "$p4" | grep -F 'jq -r' | grep -cF '.integration_branch' || true)" "Phase 4 reads .integration_branch with jq"
assert_eq "0" "$(printf '%s\n' "$p4" | grep -cF 'cf/$CF_SLUG-integrated' || true)" "Phase 4 does not re-derive the integration branch name"
assert_ge1 "$(printf '%s\n' "$p4" | grep -F 'Phase 4 fail-early:' | grep -F 'surface' | grep -cF 'halt' || true)" "every fail-early line is surfaced to the human and halts Phase 4"

# DiffNonEmpty T4: exact empty-diff line carries the fail-early prefix
assert_ge1 "$(printf '%s\n' "$p4" | grep -cF 'Phase 4 fail-early: implement.diff is empty' || true)" "exact empty-diff fail-early line"
