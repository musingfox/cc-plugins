#!/usr/bin/env bash
# The plan agent emits each contract's interface (input, output, errors) and the
# steps that fulfill it into contracts.json. schema_version stays 1; the new
# fields are optional, so a revision that carries them still merges.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

PLAN="$(cd "$CF_TESTS_DIR/../agents" && pwd)/plan.md"
SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

contracts_slice() {
  awk '/^### contracts\.json/,/^#### Worked example/' "$PLAN"
}

# T1: quoted interface keys live in the contracts.json schema slice
slice="$(contracts_slice)"
for key in input output errors implementation_plan; do
  assert_contains "$slice" "\"$key\"" "T1 slice quotes \"$key\""
done

# T2: schema_version stays 1
assert_contains "$slice" '"schema_version": 1' "T2 schema_version stays 1"

# T3: a field-rule line names implementation_plan and fulfills together
rule_line="$(grep -F 'implementation_plan' "$PLAN" | grep -F 'fulfills' || true)"
if [ -n "$rule_line" ]; then
  assert_eq "present" "present" "T3 field-rule line has implementation_plan and fulfills"
else
  assert_eq "present" "absent" "T3 field-rule line has implementation_plan and fulfills"
fi

# T4: merge keeps implementation_plan[].target from a schema_version-1 revision
FLOW="$(mktemp -d)"
target="scripts/gate.sh"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "flow",
  "contracts": [
    {
      "name": "C1",
      "summary": "old",
      "touches_files": ["scripts/gate.sh"],
      "test_cases": []
    }
  ]
}
EOF
cat > "$FLOW/revision.json" <<EOF
{
  "schema_version": 1,
  "contracts": [
    {
      "name": "C1",
      "summary": "new",
      "input": "the markdown input line",
      "output": "the markdown output line",
      "errors": "the markdown errors line",
      "implementation_plan": [
        {
          "title": "Step 2: Add the gate",
          "target": "$target",
          "approach": "revert in place",
          "order": "after Step 1"
        }
      ]
    }
  ]
}
EOF
merge_rc=0
"$SCRIPTS/cf-pi-merge-revision.sh" "$FLOW" "$FLOW/revision.json" >/dev/null || merge_rc=$?
assert_eq "0" "$merge_rc" "T4 merge-revision exits 0"
got="$(jq -r '.contracts[0].implementation_plan[0].target' "$FLOW/contracts.json")"
assert_eq "$target" "$got" "T4 implementation_plan target survives merge"
rm -rf "$FLOW"

# T5: adjacent plan pins still pass
assert_exit 0 bash "$CF_TESTS_DIR/recurring-failure-classes.test.sh"
assert_exit 0 bash "$CF_TESTS_DIR/design-vocabulary.test.sh"
