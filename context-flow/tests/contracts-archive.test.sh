#!/usr/bin/env bash
# Both writers of contracts.json archive the previous version the same way:
# contracts-prev-<YYYYmmddHHMMSS>[-n].json, never overwriting an earlier one.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
FLOW="$(mktemp -d)"
cat >"$FLOW/env.sh" <<EOF2
SESSION="$FLOW"
SESSION_BASENAME="f"
EOF2
echo '{"schema_version":1,"contracts":[{"name":"C1","summary":"a"}]}' >"$FLOW/contracts.json"
echo '{"schema_version":1,"contracts":[{"name":"C1","summary":"b"}]}' >"$FLOW/rev.json"

# Two merges inside one second: the second must not overwrite the first archive.
bash "$SCRIPTS/cf-pi-merge-revision.sh" "$FLOW" "$FLOW/rev.json" >/dev/null 2>&1
bash "$SCRIPTS/cf-pi-merge-revision.sh" "$FLOW" "$FLOW/rev.json" >/dev/null 2>&1
assert_eq "2" "$(ls "$FLOW"/contracts-prev-*.json 2>/dev/null | wc -l | tr -d ' ')" "T1 two merges keep two archives"
assert_eq "2" "$(ls "$FLOW" | grep -cE '^contracts-prev-[0-9]{14}(-[0-9]+)?\.json$')" "T2 merge archives use the shared name format"
assert_eq "1" "$(grep -c '^archive_contracts()' "$SCRIPTS/cf-pi-env.sh")" "T3 one archive helper"
rm -rf "$FLOW"
