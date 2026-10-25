#!/usr/bin/env bash
# Review repros become test cases of the contract they failed:
#   add-repros.sh --contracts FILE REPROS_FILE
# exit 0 applied (or nothing to do), 2 usage/missing file, 3 malformed, 4 jq
# missing, 5 unknown contract; the archive lands beside FILE.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)"
ADD="$SCRIPTS/add-repros.sh"

# add DIR REPROS [ARGS...]: the CLI over DIR/contracts.json. stderr goes to DIR/err.
add() { local d="$1" r="$2"; shift 2; "$ADD" --contracts "$d/contracts.json" "$r" "$@" 2>"$d/err"; }

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
out=$(add "$FLOW" "$FLOW/repros.json")
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
out=$(add "$FLOW" "$FLOW/repros.json")
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
add "$FLOW" "$FLOW/repros.json" >/dev/null
len_after=$(jq '.contracts[0].test_cases | length' "$FLOW/contracts.json")
out=$(add "$FLOW" "$FLOW/repros.json")
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
out=$(add "$FLOW" "$FLOW/repros.json")
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
# The mutant lives in the fixture, not under scripts/: a copy there survives an
# interrupted run and `git add -A` takes it.
mkdir "$FLOW/mut"
mut="$FLOW/mut/add-repros.sh"
sed '/# unknown-name check/,/# end unknown-name check/d' "$ADD" > "$mut"
chmod +x "$mut"
cp "$FLOW/contracts.orig" "$FLOW/contracts.json"
rm -f "$FLOW"/contracts-prev-*.json
out=$("$mut" --contracts "$FLOW/contracts.json" "$FLOW/repros.json" 2>"$FLOW/err9")
rc=$?
assert_eq "0" "$rc" "T9 stripped script exits 0"
t4_would_pass=0
[ "$rc" -eq 5 ] && t4_would_pass=1
assert_eq "0" "$t4_would_pass" "T9 T4 exit-5 check fails"
assert_eq "" "$(ls "$SCRIPTS" | grep -v '\.sh$' || true)" "T9 nothing left under scripts/"
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
out=$(add "$FLOW" "$FLOW/repros.json")
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
out=$(add "$FLOW" "$FLOW/repros.json")
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
assert_exit 2 "$ADD" --contracts "$FLOW/contracts.json" "$FLOW/no-such-repros.json"
rm -rf "$FLOW"

# R1: a CRLF contracts.json keeps its line endings through an append.
FLOW="$(mktemp -d)"
printf '{\r\n"schema_version": 1,\r\n"contracts": [{"name": "C1"}]\r\n}\r\n' > "$FLOW/contracts.json"
echo '{"repros":[{"contract":"C1","given":"g","expect":"e","command":"c"}]}' > "$FLOW/repros.json"
out=$(add "$FLOW" "$FLOW/repros.json")
rc=$?
assert_eq "0" "$rc" "R1 exits 0"
assert_eq "ADDED C1 R1" "$out" "R1 stdout"
assert_eq "4" "$(tr -cd '\r' < "$FLOW/contracts.json" | wc -c | tr -d ' ')" "R1 the four CRs survive"
rm -rf "$FLOW"

# ---- the new CLI ----

# T10: FILE is any name, anywhere; the archive lands beside it as contracts-prev-<ts>.json
DIR="$(mktemp -d)"
mkdir -p "$DIR/plans"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' > "$DIR/plans/my-plan.json"
cp "$DIR/plans/my-plan.json" "$DIR/orig.json"
echo '{"repros":[{"contract":"C1","given":"g","expect":"e","command":"c"}]}' > "$DIR/repros.json"
out=$("$ADD" --contracts "$DIR/plans/my-plan.json" "$DIR/repros.json" 2>"$DIR/err")
assert_eq "ADDED C1 R1" "$out" "T10 any file name: stdout"
archives=("$DIR"/plans/contracts-prev-*.json)
assert_eq "1" "${#archives[@]}" "T10 one archive beside the file"
case "$(basename "${archives[0]}")" in
  contracts-prev-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].json) _assert_pass ;;
  *) _assert_fail "T10 archive name is contracts-prev-<ts>.json: $(basename "${archives[0]}")" ;;
esac
cmp -s "$DIR/orig.json" "${archives[0]}"
assert_eq "0" "$?" "T10 the archive is the old file"
assert_eq "" "$(ls -A "$DIR" | grep -v -e '^plans$' -e '^orig.json$' -e '^repros.json$' -e '^err$')" "T10 nothing else is written outside FILE's directory"
assert_eq "" "$(ls -A "$DIR/plans" | grep -v -e '^my-plan.json$' -e '^contracts-prev-')" "T10 no temp file is left beside FILE"
rm -rf "$DIR"

# T11: two appends inside one second archive twice, never overwriting
FLOW="$(mktemp -d)"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' > "$FLOW/contracts.json"
echo '{"repros":[{"contract":"C1","given":"g1","expect":"e","command":"c"}]}' > "$FLOW/r1.json"
echo '{"repros":[{"contract":"C1","given":"g2","expect":"e","command":"c"}]}' > "$FLOW/r2.json"
add "$FLOW" "$FLOW/r1.json" >/dev/null
add "$FLOW" "$FLOW/r2.json" >/dev/null
assert_eq "2" "$(archive_count "$FLOW")" "T11 two appends, two archives"
assert_eq "2" "$(jq '.contracts[0].test_cases | length' "$FLOW/contracts.json")" "T11 both cases are in"
rm -rf "$FLOW"

# T12: usage errors exit 2 with nothing on stdout
FLOW="$(mktemp -d)"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' > "$FLOW/contracts.json"
echo '{"repros":[]}' > "$FLOW/repros.json"
for args in "" "--contracts" "--contracts $FLOW/contracts.json" "$FLOW/repros.json" \
            "--contracts $FLOW/contracts.json $FLOW/repros.json extra" "--bogus x $FLOW/repros.json" \
            "--contracts $FLOW/none.json $FLOW/repros.json"; do
  # shellcheck disable=SC2086
  out=$("$ADD" $args 2>/dev/null); rc=$?
  assert_eq "2" "$rc" "T12 usage [$args]: exit"
  assert_eq "" "$out" "T12 usage [$args]: no stdout"
done
rm -rf "$FLOW"

# T13: jq missing -> exit 4, and the contracts file is left alone
FLOW="$(mktemp -d)"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' > "$FLOW/contracts.json"
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
echo '{"repros":[{"contract":"C1","given":"g","expect":"e","command":"c"}]}' > "$FLOW/repros.json"
mkdir "$FLOW/bin"
for c in bash sh sed sort grep tr cat dirname basename mktemp rm cp mv date python3 env; do
  p="$(command -v "$c" 2>/dev/null)" && ln -sf "$p" "$FLOW/bin/$c"
done
out=$(PATH="$FLOW/bin" "$(command -v bash)" "$ADD" --contracts "$FLOW/contracts.json" "$FLOW/repros.json" 2>"$FLOW/err")
rc=$?
assert_eq "4" "$rc" "T13 jq missing: exit"
assert_eq "" "$out" "T13 jq missing: no stdout"
assert_contains "$(cat "$FLOW/err")" "jq" "T13 jq missing: stderr says so"
cmp -s "$FLOW/contracts.orig" "$FLOW/contracts.json"
assert_eq "0" "$?" "T13 jq missing: contracts unchanged"
assert_eq "0" "$(archive_count "$FLOW")" "T13 jq missing: no archive"
rm -rf "$FLOW"

# T14: malformed contracts.json (no .contracts array) exits 3 untouched
FLOW="$(mktemp -d)"
echo '{"schema_version":1}' > "$FLOW/contracts.json"
cp "$FLOW/contracts.json" "$FLOW/contracts.orig"
echo '{"repros":[]}' > "$FLOW/repros.json"
add "$FLOW" "$FLOW/repros.json" >/dev/null
assert_eq "3" "$?" "T14 malformed contracts: exit"
cmp -s "$FLOW/contracts.orig" "$FLOW/contracts.json"
assert_eq "0" "$?" "T14 malformed contracts: unchanged"
rm -rf "$FLOW"

# T15: no temp file survives an error exit
FLOW="$(mktemp -d)"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' > "$FLOW/contracts.json"
echo '{"repros":[{"contract":"Nope","given":"g","expect":"e","command":"c"}]}' > "$FLOW/repros.json"
add "$FLOW" "$FLOW/repros.json" >/dev/null
assert_eq "" "$(ls -A "$FLOW" | grep -e '^\.' || true)" "T15 no dot-file temp left after exit 5"
rm -rf "$FLOW"
