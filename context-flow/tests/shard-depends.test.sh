#!/usr/bin/env bash
# Tests for cf-pi-shard.sh depends_on derivation (contract-level `depends`
# mapped to owning shards) plus the pre-existing file-overlap grouping.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

FLOW_SESSION="$(mktemp -d)"
export FLOW_SESSION

# Contracts: P1+P2 share a file (one shard); C1 depends on P1 (cross-shard);
# C2 depends on C1 (same shard as C1 via shared file — self-dep must drop);
# X1 depends on a contract not in this plan (must drop).
cat > "$FLOW_SESSION/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {"name": "P1", "touches_files": ["src/core.py", "tests/test_core.py"]},
    {"name": "P2", "touches_files": ["src/core.py"]},
    {"name": "C1", "depends": ["P1"], "touches_files": ["src/consumer.py"]},
    {"name": "C2", "depends": ["C1"], "touches_files": ["src/consumer.py"]},
    {"name": "X1", "depends": ["NotInThisPlan"], "touches_files": ["src/other.py"]}
  ]
}
EOF

"$CF_TESTS_DIR/../scripts/cf-pi-shard.sh" "$FLOW_SESSION" >/dev/null
S="$FLOW_SESSION/shards.json"

# T1: grouping unchanged — P1+P2 co-locate, C1+C2 co-locate, X1 alone (3 shards).
assert_eq "3" "$(jq -r '.fan_out_count' "$S")" "T1 fan_out_count"

# Resolve which shard owns which contract (letter ids depend on emission order).
sid_of() { jq -r --arg n "$1" '.groups | to_entries[] | select(.value.contracts | index($n)) | .key' "$S"; }
P_SID="$(sid_of P1)"; C_SID="$(sid_of C1)"; X_SID="$(sid_of X1)"

# T2: dependent shard lists the owner of its prerequisite contract.
assert_eq "[\"$P_SID\"]" "$(jq -c --arg s "$C_SID" '.groups[$s].depends_on' "$S")" \
  "T2 C-shard depends_on P-shard"

# T3: same-shard dependency (C2 -> C1) does not self-reference.
self_dep=$(jq -r --arg s "$C_SID" '.groups[$s].depends_on | index($s) != null' "$S")
assert_eq "false" "$self_dep" "T3 no self-dependency"

# T4: dependency on a contract outside this plan drops silently.
assert_eq "[]" "$(jq -c --arg s "$X_SID" '.groups[$s].depends_on' "$S")" \
  "T4 unknown dep drops"

# T5: shards with no depends get an explicit empty list (consumers need no // guard).
assert_eq "[]" "$(jq -c --arg s "$P_SID" '.groups[$s].depends_on' "$S")" \
  "T5 no-dep shard has depends_on []"

rm -rf "$FLOW_SESSION"
