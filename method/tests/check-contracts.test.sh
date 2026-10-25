#!/usr/bin/env bash
# Self-test for method/scripts/check-contracts.sh. Every case asserts stdout,
# stderr and exit; fixtures are written to a temp dir, never to the repo.

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../scripts/check-contracts.sh"
TMP="$(mktemp -d)"
trap 'chmod -R u+rwx "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT

# A contract that satisfies every rule; cases break one field at a time.
GOOD='{"name":"C","observes":["stdout","exit"],"touches_files":["a.sh","t.sh"],"test_files":["t.sh"],"test_cases":[{"id":"T1","given":"x","expect":"stdout: ok, exit: 0"}]}'
doc() { printf '{"schema_version":1,"contracts":[%s]}' "$1"; }
mut() { jq -c "$1" <<<"$GOOD"; }

# run_case LABEL FILE WANT_EXIT WANT_STDERR  (stdout must always be empty)
run_case() {
  local label=$1 file=$2 want_rc=$3 want_err=$4 out err rc
  out="$(bash "$SCRIPT" "$file" 2>"$TMP/err")"; rc=$?
  err="$(cat "$TMP/err")"
  if [ "$rc" -eq "$want_rc" ] && [ -z "$out" ] && [ "$err" = "$want_err" ]; then
    ok "$label"
  else
    bad "$label (exit $rc want $want_rc; stdout '$out'; stderr '$err' want '$want_err')"
  fi
}
# run_doc LABEL CONTRACT_JSON WANT_EXIT WANT_STDERR
run_doc() { doc "$2" >"$TMP/f.json"; run_case "$1" "$TMP/f.json" "$3" "$4"; }
# run_err LABEL FILE : exit 2, one stderr line starting "check-contracts: "
run_err() {
  local out err rc
  out="$(bash "$SCRIPT" "$2" 2>"$TMP/err")"; rc=$?
  err="$(cat "$TMP/err")"
  if [ "$rc" -eq 2 ] && [ -z "$out" ] && [[ "$err" == "check-contracts: "* ]] && [ "$(wc -l <<<"$err")" -eq 1 ]; then
    ok "$1"
  else
    bad "$1 (exit $rc; stdout '$out'; stderr '$err')"
  fi
}

# --- usage errors: exit 2 ---
run_err "missing file" "$TMP/nope.json"
echo '{not json' >"$TMP/bad.json"
run_err "not JSON" "$TMP/bad.json"
: >"$TMP/empty.json"
run_err "empty file is not JSON" "$TMP/empty.json"
echo '{"schema_version":1}' >"$TMP/nc.json"
run_err "no contracts key" "$TMP/nc.json"
echo '{"contracts":{"a":1}}' >"$TMP/nc2.json"
run_err "contracts not an array" "$TMP/nc2.json"
echo '{}' >"$TMP/unr.json"; chmod 000 "$TMP/unr.json"
if [ -r "$TMP/unr.json" ]; then ok "unreadable file (skipped: running as a user that can read it)"
else run_err "unreadable file" "$TMP/unr.json"; fi

# --- clean ---
run_doc "valid contract: exit 0, silent" "$GOOD" 0 ""
run_doc "empty contracts array: exit 0, silent" "" 0 ""
run_doc "test_files [] allowed" "$(mut '.test_files=[]')" 0 ""
run_doc "all four channels accepted" "$(mut '.observes=["stdout","stderr","exit","files"]|.test_cases[0].expect="stdout: a, stderr: empty, exit: 0, files: none"')" 0 ""

# --- observes ---
run_doc "observes missing" "$(mut 'del(.observes)')" 1 "C: observes is missing"
run_doc "observes not an array" "$(mut '.observes="stdout"')" 1 "C: observes is not an array"
run_doc "observes empty" "$(mut '.observes=[]')" 1 "C: observes is empty"
run_doc "observes bad value" "$(mut '.observes=["stdout","network"]')" 1 "C: observes holds invalid value network"

# --- touches_files ---
run_doc "touches_files missing" "$(mut 'del(.touches_files)|.test_files=[]')" 1 "C: touches_files is missing"
run_doc "touches_files not an array" "$(mut '.touches_files="a.sh"|.test_files=[]')" 1 "C: touches_files is not an array"
run_doc "touches_files empty" "$(mut '.touches_files=[]|.test_files=[]')" 1 "C: touches_files is empty"

# --- test_files ---
run_doc "test_files missing" "$(mut 'del(.test_files)')" 1 "C: test_files is missing"
run_doc "test_files not an array" "$(mut '.test_files="t.sh"')" 1 "C: test_files is not an array"
run_doc "test_files entry outside touches_files" "$(mut '.test_files=["t.sh","z.sh"]')" 1 "C: test_files entry z.sh is not in touches_files"

# --- test_cases ---
run_doc "test_cases missing" "$(mut 'del(.test_cases)')" 1 "C: test_cases is missing"
run_doc "test_cases not an array" "$(mut '.test_cases="T1"')" 1 "C: test_cases is not an array"
run_doc "test_cases empty" "$(mut '.test_cases=[]')" 1 "C: test_cases is empty"

# --- expect names every observed channel ---
run_doc "expect lacks one channel" "$(mut '.test_cases[0].expect="stdout: ok"')" 1 "C: test case T1 expect does not name channel exit"
run_doc "expect lacks every channel" "$(mut '.test_cases[0].expect="ok"')" 1 "C: test case T1 expect does not name channel stdout
C: test case T1 expect does not name channel exit"
run_doc "expect channel without colon" "$(mut '.test_cases[0].expect="stdout: ok, exit 0"')" 1 "C: test case T1 expect does not name channel exit"
run_doc "second test case checked by id" "$(mut '.test_cases+=[{"id":"T2","given":"y","expect":"exit: 1"}]')" 1 "C: test case T2 expect does not name channel stdout"

# --- several contracts, each named in its own lines ---
run_doc "violations in two contracts" "$GOOD,$(mut '.name="D"|.observes=[]'),$(mut '.name="E"|del(.test_cases)')" 1 "D: observes is empty
E: test_cases is missing"

# --- never writes a file ---
mkdir "$TMP/ro"; doc "$(mut 'del(.observes)')" >"$TMP/ro/f.json"
before="$(cd "$TMP/ro" && find . | sort)"
(cd "$TMP/ro" && bash "$SCRIPT" f.json >/dev/null 2>&1)
after="$(cd "$TMP/ro" && find . | sort)"
if [ "$before" = "$after" ]; then ok "writes no file beside the input"; else bad "writes no file beside the input"; fi

echo "---"
echo "passed: $PASS, failed: $FAIL"
[ "$FAIL" -eq 0 ]
