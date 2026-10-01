#!/usr/bin/env bash
# The docs name cf:implement as the default builder and OMP as the opt-in overflow.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd)"
README="$CF_ROOT/README.md"
DESIGN="$CF_ROOT/docs/parallel-sharded-design.md"
PROTOCOL="$CF_ROOT/docs/pi-implementer-protocol.md"
REVIEW="$CF_ROOT/agents/review.md"
IMPLEMENT="$CF_ROOT/agents/implement.md"

# T1
assert_eq "0" "$(grep -c 'The default implementer is an OMP worker' "$README" || true)" "T1 README no longer calls OMP the default"
feature=$(grep -m1 'Parallel sharded implementation' "$README")
assert_contains "$feature" "cf:implement" "T1b shard feature line names cf:implement"
assert_contains "$feature" "revert" "T1c shard feature line still names the revert check"
assert_contains "$(cat "$README")" "opt-in" "T1d README says OMP is opt-in"

# T2: every Optional Dependencies line naming pi-dispatch says it is required.
deps=$(awk '/^### Optional Dependencies/{f=1; next} f && /^#/{exit} f' "$README")
pd_lines=$(printf '%s\n' "$deps" | grep 'pi-dispatch')
assert_contains "$pd_lines" "required" "T2 the pi-dispatch dependency line says required"
assert_eq "0" "$(printf '%s\n' "$pd_lines" | grep -vc 'required' || true)" "T2b no pi-dispatch line in Optional Dependencies lacks required"

# T3
sec() { awk -v n="$2" '$0 ~ "^## " n "\\." {f=1; print; next} f && /^## /{exit} f' "$1"; }
assert_contains "$(sec "$DESIGN" 1)" "--gates-only" "T3 design section 1 names --gates-only"
assert_contains "$(sec "$DESIGN" 8)" "OMP rounds" "T3b design section 8 limits the Monitor to OMP rounds"
assert_contains "$(grep '^J\.' "$DESIGN")" "cf:implement" "T3c design decision J names cf:implement"

# T4
assert_eq "0" "$(grep -c 'Claude fallback' "$PROTOCOL" || true)" "T4 protocol has no Claude fallback"
assert_eq "0" "$(grep -c 'Claude implementer fallback' "$PROTOCOL" || true)" "T4b protocol has no Claude implementer fallback"
assert_contains "$(head -5 "$PROTOCOL")" "cf:implement" "T4c protocol opening names cf:implement"

# T5
review_head=$(head -15 "$REVIEW")
assert_contains "$(printf '%s' "$review_head" | tr '[:upper:]' '[:lower:]')" "sonnet" "T5 review floor note names sonnet"
assert_contains "$review_head" "capability floor" "T5b review floor note keeps capability floor"

# T6: the judge's model tier is at or above the builder's; the guard must catch a lower one.
rank() {
  case "$(sed -n 's/^model: *//p' "$1" | head -1)" in
    haiku) echo 1 ;; sonnet) echo 2 ;; opus) echo 3 ;; *) echo 0 ;;
  esac
}
tier_violation() { [ "$(rank "$1")" -lt "$(rank "$2")" ] && echo violation || echo ok; }

assert_eq "ok" "$(tier_violation "$REVIEW" "$IMPLEMENT")" "T6 real review tier is at or above implement"
copy="$(mktemp)"
sed 's/^model: .*/model: haiku/' "$REVIEW" > "$copy"
assert_eq "violation" "$(tier_violation "$copy" "$IMPLEMENT")" "T6b a haiku review copy is reported as a violation"
rm -f "$copy"

# T7
for t in revert-gate-docs brief-anatomy-doc brief-writable-rule review-two-axis; do
  if bash "$CF_TESTS_DIR/$t.test.sh" >/dev/null 2>&1; then
    assert_eq "ok" "ok" "T7 $t passes"
  else
    assert_eq "ok" "fail" "T7 $t passes"
  fi
done

# T8: design section 7 scopes "main never re-launches" to OMP rounds and names the REBRIEF loop.
s7=$(awk '/^## 7\./{f=1; print; next} f && /^## /{exit} f' "$DESIGN")
assert_eq "0" "$(printf '%s\n' "$s7" | grep -c 'main never re-launches for a test failure' || true)" "T8 design section 7 no longer says main never re-launches"
assert_contains "$s7" "REBRIEF" "T8b design section 7 names the REBRIEF re-launch"
assert_contains "$s7" "An infrastructure re-launch is self-cleaning" "T8c design section 7 scopes self-cleaning to infrastructure re-launches"
assert_eq "0" "$(printf '%s\n' "$s7" | grep -c 'A main-issued re-launch is self-cleaning' || true)" "T8d design section 7 does not call a main-issued re-launch self-cleaning"
