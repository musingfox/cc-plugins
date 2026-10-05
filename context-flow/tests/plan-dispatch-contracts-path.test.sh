#!/usr/bin/env bash
# agents/plan.md writes contracts.json to the dispatch's `Contracts path:`, and
# cf-pi-shard.sh exits 3 at §3.1 without it -- after the human already approved.
# So the Phase 2 dispatch names the path and the Plan -> Gate check verifies it.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$(cd "$CF_TESTS_DIR/.." && pwd)/commands/cf.md"

dispatch="$(awk '/^## Phase 2: Plan/{p=1} /^### Transition Validation: Plan/{exit} p' "$CFMD")"
assert_contains "$dispatch" 'Contracts path: $SESSION/contracts.json' "T1 Phase 2 dispatch names the contracts path"

gate_check="$(awk '/^### Transition Validation: Plan/{p=1} /^### Human Gate/{exit} p' "$CFMD")"
assert_contains "$gate_check" "jq -e '.schema_version' \"\$SESSION/contracts.json\"" "T2 Plan -> Gate check verifies contracts.json"
