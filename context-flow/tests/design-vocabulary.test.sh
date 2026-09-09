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
