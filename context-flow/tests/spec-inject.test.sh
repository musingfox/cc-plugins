#!/usr/bin/env bash
# Tests for cf-pi-brief.sh architecture-spec injection: entries whose scope
# matches a shard's touches_files land in the brief, non-matching ones do not,
# and an absent spec plugin is silently skipped (specs are optional context).
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
FLOW="$(mktemp -d)"
SPECS="$(mktemp -d)"
export SPEC_DIR="$SPECS"

# One matching entry, one non-matching, one proposed (must never be injected).
cat > "$SPECS/lib-is-pure.md" <<'EOF'
---
id: lib-is-pure
status: accepted
scope:
  - "src/**"
verify: null
adr: null
---
LIB_BODY_MARKER: src/ holds no I/O.
EOF
cat > "$SPECS/docs-untouched.md" <<'EOF'
---
id: docs-untouched
status: accepted
scope:
  - "docs/**"
verify: null
adr: null
---
DOCS_BODY_MARKER: should not appear.
EOF
cat > "$SPECS/not-yet-approved.md" <<'EOF'
---
id: not-yet-approved
status: proposed
scope:
  - "src/**"
verify: null
adr: null
---
PROPOSED_BODY_MARKER: should not appear.
EOF

cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {"name": "OnlyContract", "touches_files": ["src/lib.py"],
     "behavior": "b", "test_cases": [{"input": "i", "expected": "e"}]}
  ]
}
EOF

FLOW_BASE="$(basename "$FLOW")"
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="$FLOW_BASE"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
PI_PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_PROVIDER=""
PI_MODEL=""
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
EOF
touch "$FLOW/cleanup.sh"

"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
SID=$(jq -r '.groups | keys[0]' "$FLOW/shards.json")
SHARD_SESSION="$FLOW/shards/$SID"

BRIEF=$("$SCRIPTS/cf-pi-brief.sh" "$SHARD_SESSION" "goal" "constraints" "true")
assert_eq "0" "$?" "T0 brief assembles"

# T1: the matching entry's body is injected, under a demoted heading.
assert_contains "$(cat "$BRIEF")" "LIB_BODY_MARKER" "T1 matching spec body injected"
assert_contains "$(cat "$BRIEF")" "### lib-is-pure" "T1b slice heading demoted to ###"
assert_contains "$(cat "$BRIEF")" "## Architecture Specs (binding)" "T1c section header present"

# T2: an entry whose scope misses touches_files stays out.
assert_eq "0" "$(grep -c 'DOCS_BODY_MARKER' "$BRIEF" || true)" "T2 non-matching spec not injected"

# T3: a proposed entry is never injected, even when its scope matches.
assert_eq "0" "$(grep -c 'PROPOSED_BODY_MARKER' "$BRIEF" || true)" "T3 proposed spec not injected"

# T4: no spec plugin installed -> brief still assembles, section absent.
ISOLATED="$(mktemp -d)"
mkdir -p "$ISOLATED/context-flow"
cp -R "$CF_TESTS_DIR/../scripts" "$CF_TESTS_DIR/../docs" "$ISOLATED/context-flow/"
BRIEF2=$(CLAUDE_PLUGIN_ROOT="$ISOLATED/context-flow" "$ISOLATED/context-flow/scripts/cf-pi-brief.sh" \
  "$SHARD_SESSION" "goal" "constraints" "true")
rc=$?
assert_eq "0" "$rc" "T4 brief assembles without the spec plugin"
assert_eq "0" "$(grep -c 'Architecture Specs' "$BRIEF2" || true)" "T4b spec section absent without the plugin"

rm -rf "$FLOW" "$SPECS" "$ISOLATED"
