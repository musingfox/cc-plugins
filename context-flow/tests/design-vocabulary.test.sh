#!/usr/bin/env bash
# Pins the design-vocabulary glossary shared by research and plan agents.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

AGENTS="$(cd "$CF_TESTS_DIR/../agents" && pwd)"
RESEARCH="$AGENTS/research.md"
PLAN="$AGENTS/plan.md"

glossary_range() {
  awk '/^## Design Vocabulary/,/^## Methodology/' "$1"
}

heading_line() {
  grep -n -m1 "^$2" "$1" | cut -d: -f1
}

assert_ge1() {
  local n="$1" msg="$2"
  if [ "${n:-0}" -ge 1 ]; then
    assert_eq "ge1" "ge1" "$msg"
  else
    assert_eq ">=1" "$n" "$msg"
  fi
}

count_f() {
  glossary_range "$1" | grep -cF "$2" || true
}

# DesignVocabularySection T1–T2: eight bold terms in each glossary range
for term in '**Module**' '**Interface**' '**Implementation**' '**Depth**' \
            '**Seam**' '**Adapter**' '**Leverage**' '**Locality**'; do
  assert_ge1 "$(count_f "$RESEARCH" "$term")" "research glossary has $term"
  assert_ge1 "$(count_f "$PLAN" "$term")" "plan glossary has $term"
done

# T3–T4: criterion phrases
for phrase in 'Deletion test' 'interface is the test surface' 'One adapter' \
              'Two adapters' 'implementation lines'; do
  assert_ge1 "$(count_f "$RESEARCH" "$phrase")" "research glossary has $phrase"
  assert_ge1 "$(count_f "$PLAN" "$phrase")" "plan glossary has $phrase"
done

# T5
for phrase in 'Do not substitute' 'Domain words'; do
  assert_ge1 "$(count_f "$RESEARCH" "$phrase")" "research glossary has $phrase"
  assert_ge1 "$(count_f "$PLAN" "$phrase")" "plan glossary has $phrase"
done

# T6: Design Vocabulary precedes Methodology
for f in "$RESEARCH" "$PLAN"; do
  dv=$(heading_line "$f" '## Design Vocabulary')
  meth=$(heading_line "$f" '## Methodology')
  if [ -n "$dv" ] && [ -n "$meth" ] && [ "$dv" -lt "$meth" ]; then
    assert_eq "order" "order" "$(basename "$f"): Design Vocabulary before Methodology"
  else
    assert_eq "dv<meth" "$dv,$meth" "$(basename "$f"): Design Vocabulary before Methodology"
  fi
done

# GlossaryCopiesIdentical
diff_out=$(diff <(glossary_range "$RESEARCH") <(glossary_range "$PLAN") || true)
assert_eq "" "$diff_out" "research and plan glossary ranges are byte-identical"
gloss_lines=$(glossary_range "$RESEARCH" | wc -l | tr -d ' ')
if [ "$gloss_lines" -ge 20 ]; then
  assert_eq "ge20" "ge20" "research glossary range has >= 20 lines"
else
  assert_eq ">=20" "$gloss_lines" "research glossary range has >= 20 lines"
fi

# DesignItTwiceRecorded
for phrase in 'DESIGN-IT-TWICE' 'not imported' 'Agent tool'; do
  assert_ge1 "$(count_f "$RESEARCH" "$phrase")" "research glossary has $phrase"
  assert_ge1 "$(count_f "$PLAN" "$phrase")" "plan glossary has $phrase"
done

# UpstreamAttribution
for phrase in \
  'https://github.com/mattpocock/skills' \
  '`codebase-design`' \
  'MIT' \
  'Copyright (c) 2026 Matt Pocock' \
  '3cca18b368ae95cdbdebbff572ccafa662551015'; do
  assert_ge1 "$(count_f "$RESEARCH" "$phrase")" "research glossary has $phrase"
  assert_ge1 "$(count_f "$PLAN" "$phrase")" "plan glossary has $phrase"
done

range_awk() {
  awk -v s="$2" -v e="$3" '$0 ~ s {p=1} p {print} $0 ~ e && p {exit}' "$1"
}

count_in_range_f() {
  range_awk "$1" "$2" "$3" | grep -cF "$4" || true
}

count_in_range_fi() {
  range_awk "$1" "$2" "$3" | grep -ciF "$4" || true
}

research_schema_forbidden() {
  local t n1 n2
  t=$(range_awk "$1" '^## Output Schema' '^## Design System Audit')
  n1=$(printf '%s\n' "$t" | grep -Ei 'component|service|boundar' | wc -l | tr -d ' ')
  n2=$(printf '%s\n' "$t" | grep -E 'API' | wc -l | tr -d ' ')
  echo $((n1 + n2))
}

research_dp_forbidden() {
  local t n1 n2
  t=$(range_awk "$1" '^## Decision Points' '^## Return Format')
  n1=$(printf '%s\n' "$t" | grep -Ei 'component|service|boundar' | wc -l | tr -d ' ')
  n2=$(printf '%s\n' "$t" | grep -E 'API' | wc -l | tr -d ' ')
  echo $((n1 + n2))
}

without_glossary() {
  awk '/^## Design Vocabulary/{s=1} /^## Methodology/{s=0} !s {print}' "$1"
}

# ResearchDescribesDesignInVocabulary
assert_eq "0" "$(research_schema_forbidden "$RESEARCH")" "research Output Schema..Design System Audit has no forbidden terms"
assert_eq "0" "$(research_dp_forbidden "$RESEARCH")" "research Decision Points..Return Format has no forbidden terms"
for phrase in interface seam module; do
  assert_ge1 "$(count_in_range_fi "$RESEARCH" '^## Output Schema' '^## Design System Audit' "$phrase")" "research Output Schema range has $phrase"
done
assert_ge1 "$(count_in_range_fi "$RESEARCH" '^## Output Schema' '^## Design System Audit' 'deletion test')" "research Output Schema range has deletion test"
assert_ge1 "$(count_in_range_f "$RESEARCH" '^## Methodology' '^## Sourcing External Findings' 'caller must know')" "research Methodology has caller must know"
assert_ge1 "$(count_in_range_f "$RESEARCH" '^## Reporting Style' '^## Output Schema' 'invariants')" "research Reporting Style has invariants"
assert_ge1 "$(count_in_range_f "$RESEARCH" '^## What to Investigate' '^## Reporting Style' 'seam')" "research What to Investigate has seam"
sig=$(grep -cF 'interface signatures' "$RESEARCH" || true)
assert_eq "0" "$sig" "research.md has no 'interface signatures'"
bound=$(without_glossary "$RESEARCH" | grep -ci 'boundar' || true)
assert_eq "0" "$bound" "research.md outside glossary has no boundar"
assert_ge1 "$(count_in_range_f "$RESEARCH" '^## Design System Audit' '^## Decision Points' 'Component library')" "research Design System Audit keeps Component library"
assert_ge1 "$(count_in_range_f "$RESEARCH" '^## What to Investigate' '^## Reporting Style' 'API rate limits')" "research What to Investigate keeps API rate limits"
