#!/usr/bin/env bash
# Review repros become test cases of the contract they failed.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$CF_TESTS_DIR/../scripts"
ADD="$SCRIPTS/cf-pi-add-repros.sh"
PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"

sha256() { shasum -a 256 "$1" | awk '{print $1}'; }

archive_count() {
  shopt -s nullglob
  local files=("$1"/contracts-prev-*.json)
  echo "${#files[@]}"
}

# T1: C1 has T1,T2; one repro for C1 is appended as R1; C2 and schema stay;
# the previous file is archived once.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "flow_id": "t",
  "contracts": [
    {
      "name": "C1",
      "touches_files": ["src/a.py"],
      "test_cases": [
        {"id": "T1", "given": "g1", "expect": "e1"},
        {"id": "T2", "given": "g2", "expect": "e2"}
      ]
    },
    {
      "name": "C2",
      "touches_files": ["src/a.py"],
      "note": "leave-me",
      "test_cases": [{"id": "T1", "given": "other", "expect": "o"}]
    }
  ]
}
EOF
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
cat > "$FLOW/repros.json" <<'EOF'
{"repros":[{"contract":"C1","given":"g","expect":"e","command":"c"}]}
EOF
out=$("$ADD" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "0" "$rc" "T1 exits 0"
assert_eq "ADDED C1 R1" "$out" "T1 stdout"
assert_eq '{"command":"c","expect":"e","given":"g","id":"R1"}' \
  "$(jq -c -S '.contracts[0].test_cases[2]' "$FLOW/contracts.json")" \
  "T1 appended case"
assert_eq "3" "$(jq '.contracts[0].test_cases | length' "$FLOW/contracts.json")" "T1 case count"
assert_eq "$(jq -S '.contracts[1]' "$FLOW/contracts.orig")" \
  "$(jq -S '.contracts[1]' "$FLOW/contracts.json")" "T1 C2 unchanged"
assert_eq "1" "$(jq -r '.schema_version' "$FLOW/contracts.json")" "T1 schema_version"
assert_eq "1" "$(archive_count "$FLOW")" "T1 one archive"
archived=$(echo "$FLOW"/contracts-prev-*.json)
cmp -s "$FLOW/contracts.orig" "$archived"
assert_eq "0" "$?" "T1 archive equals the old file"

# T8: that appended R1 shows up inside C1's block of the worker brief.
FLOW_BASE="$(basename "$FLOW")"
cat > "$FLOW/env.sh" <<EOF
SESSION="$FLOW"
SESSION_BASENAME="$FLOW_BASE"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$SCRIPTS"
PI_PROTOCOL="$PROTOCOL"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_DISPATCH_CMD=""
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
EOF
touch "$FLOW/cleanup.sh"
"$SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
sid=$(jq -r '.groups | to_entries[] | select(.value.contracts | index("C1")) | .key' "$FLOW/shards.json")
brief=$("$SCRIPTS/cf-pi-brief.sh" "$FLOW/shards/$sid" "goal" "constraints" "true")
c1_block=$(awk '/^### C1$/{f=1} f && /^### / && !/^### C1$/{exit} f' "$brief")
assert_contains "$c1_block" "R1: given g -> expect e" "T8 R1 line inside C1"
rm -rf "$FLOW"

# T2: C1 already uses R1, so the next repro takes R2.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "contracts": [
    {"name": "C1", "touches_files": ["src/a.py"],
     "test_cases": [{"id": "R1", "given": "old", "expect": "o", "command": "oc"}]}
  ]
}
EOF
cat > "$FLOW/repros.json" <<'EOF'
{"repros":[{"contract":"C1","given":"g","expect":"e","command":"c"}]}
EOF
out=$("$ADD" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "0" "$rc" "T2 exits 0"
assert_eq "ADDED C1 R2" "$out" "T2 stdout"
rm -rf "$FLOW"

# T3: the same repros file a second time is a duplicate; no second archive.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "contracts": [
    {"name": "C1", "touches_files": ["src/a.py"],
     "test_cases": [
       {"id": "T1", "given": "g1", "expect": "e1"},
       {"id": "T2", "given": "g2", "expect": "e2"}
     ]}
  ]
}
EOF
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
cat > "$FLOW/repros.json" <<'EOF'
{"repros":[{"contract":"C1","given":"g","expect":"e","command":"c"}]}
EOF
"$ADD" "$FLOW" "$FLOW/repros.json" >/dev/null
len_after=$(jq '.contracts[0].test_cases | length' "$FLOW/contracts.json")
out=$("$ADD" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "0" "$rc" "T3 exits 0"
assert_eq "DUPLICATE C1 R1" "$out" "T3 stdout"
assert_eq "$len_after" "$(jq '.contracts[0].test_cases | length' "$FLOW/contracts.json")" "T3 length unchanged"
assert_eq "1" "$(archive_count "$FLOW")" "T3 still one archive"
archived=$(echo "$FLOW"/contracts-prev-*.json)
cmp -s "$FLOW/contracts.orig" "$archived"
assert_eq "0" "$?" "T3 archive still the pre-append file"
rm -rf "$FLOW"

# T4: a repro naming an unknown contract fails the whole batch.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{
  "schema_version": 1,
  "contracts": [
    {"name": "C1", "touches_files": ["src/a.py"], "test_cases": []}
  ]
}
EOF
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
cat > "$FLOW/repros.json" <<'EOF'
{"repros":[
  {"contract":"C1","given":"g","expect":"e","command":"c"},
  {"contract":"Nope","given":"g","expect":"e","command":"c"}
]}
EOF
before=$(sha256 "$FLOW/contracts.json")
out=$("$ADD" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "5" "$rc" "T4 exits 5"
assert_eq "" "$out" "T4 no stdout"
assert_contains "$(cat "$FLOW/err")" "Nope" "T4 stderr names Nope"
assert_eq "$before" "$(sha256 "$FLOW/contracts.json")" "T4 sha unchanged"
assert_eq "0" "$(archive_count "$FLOW")" "T4 no archive"
cmp -s "$FLOW/contracts.orig" "$FLOW/contracts.json"
assert_eq "0" "$?" "T4 file unchanged"

# T9: without the unknown-name check, that same T4 scenario exits 0,
# so T4's expectation fails. The check is what makes T4 red-on-revert.
mut=$(mktemp "$SCRIPTS/cf-pi-add-repros.XXXXXX")
sed '/# unknown-name check/,/# end unknown-name check/d' "$ADD" > "$mut"
chmod +x "$mut"
cp "$FLOW/contracts.orig" "$FLOW/contracts.json"
rm -f "$FLOW"/contracts-prev-*.json
out=$("$mut" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err9")
rc=$?
rm -f "$mut"
assert_eq "0" "$rc" "T9 stripped script exits 0"
t4_would_pass=0
[ "$rc" -eq 5 ] && t4_would_pass=1
assert_eq "0" "$t4_would_pass" "T9 T4 exit-5 check fails"
rm -rf "$FLOW"

# T5: an entry missing given is rejected and the file is left alone.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{"schema_version":1,"contracts":[{"name":"C1","test_cases":[{"id":"T1","given":"g1","expect":"e1"}]}]}
EOF
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
cat > "$FLOW/repros.json" <<'EOF'
{"repros":[{"contract":"C1","expect":"e","command":"c"}]}
EOF
out=$("$ADD" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "3" "$rc" "T5 exits 3"
cmp -s "$FLOW/contracts.orig" "$FLOW/contracts.json"
assert_eq "0" "$?" "T5 contracts.json unchanged"
assert_eq "0" "$(archive_count "$FLOW")" "T5 no archive"
rm -rf "$FLOW"

# T6: an empty repros array is a successful no-op.
FLOW="$(mktemp -d)"
cat > "$FLOW/contracts.json" <<'EOF'
{"schema_version":1,"contracts":[{"name":"C1","test_cases":[{"id":"T1","given":"g1","expect":"e1"}]}]}
EOF
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
echo '{"repros":[]}' > "$FLOW/repros.json"
out=$("$ADD" "$FLOW" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "0" "$rc" "T6 exits 0"
assert_eq "" "$out" "T6 empty stdout"
cmp -s "$FLOW/contracts.orig" "$FLOW/contracts.json"
assert_eq "0" "$?" "T6 unchanged"
assert_eq "0" "$(archive_count "$FLOW")" "T6 no archive"
rm -rf "$FLOW"

# T7: a repros path that does not exist is a usage-class failure.
FLOW="$(mktemp -d)"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' > "$FLOW/contracts.json"
assert_exit 2 "$ADD" "$FLOW" "$FLOW/no-such-repros.json"
rm -rf "$FLOW"
