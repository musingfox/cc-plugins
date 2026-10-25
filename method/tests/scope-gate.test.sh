#!/usr/bin/env bash
# scope-gate.sh: every stdout line and exit code of the scope gate's contract,
# against real git repos built under mktemp -d.
#   exit 0 clean (ALLOWLISTED alone still exits 0), 2 UNDECLARED present, 1 ERROR
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

SCOPE="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)/scope-gate.sh"

# scope BASE [HEAD]: the gate over REPO and CONTRACTS -> OUT_TXT, RC
scope() {
  OUT_TXT="$(bash "$SCOPE" --repo "$REPO" --base "$1" --head "${2:-HEAD}" --contracts "$CONTRACTS" 2>"$REPO_TOP/stderr")"
  RC=$?
}

# fixture: a base commit, then a commit adding the files named in $@
fixture() {
  new_repo
  echo keep >"$REPO/keep.txt"; commit_all base
  BASE="$(head_sha)"
  local f
  for f in "$@"; do mkdir -p "$(dirname "$REPO/$f")"; echo "$f" >"$REPO/$f"; done
  commit_all work
}

# ==== verdicts ====

# T1: everything declared -> silent, exit 0
fixture src/a.sh src/b.sh
write_contracts '[{"name":"C1","touches_files":["src/a.sh"]},{"name":"C2","touches_files":["src/b.sh"]}]'
scope "$BASE"
assert_eq "" "$OUT_TXT" "T1 clean: no stdout"
assert_eq "0" "$RC" "T1 clean: exit"
drop_repo

# T2: the declared set is the union of every contract's touches_files, and an
# undeclared file is named alone
fixture src/a.sh src/b.sh src/rogue.sh
write_contracts '[{"name":"C1","touches_files":["src/a.sh"]},{"name":"C2","touches_files":["src/b.sh"]}]'
scope "$BASE"
assert_eq "UNDECLARED src/rogue.sh" "$OUT_TXT" "T2 undeclared: stdout"
assert_eq "2" "$RC" "T2 undeclared: exit"
drop_repo

# T3: several undeclared files come as one sorted csv line
fixture src/z.sh src/a.sh docs/m.md
write_contracts '[{"name":"C1","touches_files":[]}]'
scope "$BASE"
assert_eq "UNDECLARED docs/m.md,src/a.sh,src/z.sh" "$OUT_TXT" "T3 csv: stdout"
assert_eq "2" "$RC" "T3 csv: exit"
drop_repo

# T4: root build/lock manifests are ALLOWLISTED and exit 0
fixture package.json uv.lock Cargo.toml requirements-dev.txt go.sum
write_contracts '[{"name":"C1","touches_files":[]}]'
scope "$BASE"
assert_eq "ALLOWLISTED Cargo.toml,go.sum,package.json,requirements-dev.txt,uv.lock" "$OUT_TXT" "T4 allowlisted: stdout"
assert_eq "0" "$RC" "T4 allowlisted: exit"
drop_repo

# T5: a nested or look-alike manifest is not allowlisted
fixture sub/package.json docs/uv.lock.md
write_contracts '[{"name":"C1","touches_files":[]}]'
scope "$BASE"
assert_eq "UNDECLARED docs/uv.lock.md,sub/package.json" "$OUT_TXT" "T5 look-alikes: stdout"
assert_eq "2" "$RC" "T5 look-alikes: exit"
drop_repo

# T6: both lines, ALLOWLISTED first, and the exit is 2
fixture package.json src/rogue.sh
write_contracts '[{"name":"C1","touches_files":[]}]'
scope "$BASE"
assert_eq "ALLOWLISTED package.json
UNDECLARED src/rogue.sh" "$OUT_TXT" "T6 both: stdout"
assert_eq "2" "$RC" "T6 both: exit"
drop_repo

# T7: a declared manifest is declared, not allowlisted
fixture package.json
write_contracts '[{"name":"C1","touches_files":["package.json"]}]'
scope "$BASE"
assert_eq "" "$OUT_TXT" "T7 declared manifest: no stdout"
assert_eq "0" "$RC" "T7 declared manifest: exit"
drop_repo

# T8: commit union, not net diff -- a file created and deleted again still counts
fixture src/a.sh
echo tmp >"$REPO/src/tmp.sh"; commit_all add-tmp
git -C "$REPO" rm -q src/tmp.sh; commit_all drop-tmp
write_contracts '[{"name":"C1","touches_files":["src/a.sh"]}]'
scope "$BASE"
assert_eq "UNDECLARED src/tmp.sh" "$OUT_TXT" "T8 created then deleted: stdout"
assert_eq "2" "$RC" "T8 created then deleted: exit"
drop_repo

# T9: only commits in base..head count -- earlier history and later commits do not
new_repo
echo x >"$REPO/early.txt"; commit_all early
BASE="$(head_sha)"
echo y >"$REPO/mine.txt"; commit_all mine
HEAD_SHA="$(head_sha)"
echo z >"$REPO/later.txt"; commit_all later
write_contracts '[{"name":"C1","touches_files":["mine.txt"]}]'
scope "$BASE" "$HEAD_SHA"
assert_eq "" "$OUT_TXT" "T9 range: later and earlier commits are not charged"
assert_eq "0" "$RC" "T9 range: exit"
drop_repo

# T10: --base and --head are any revs: a branch, a tag, an abbreviated sha, HEAD~1
new_repo
echo x >"$REPO/keep.txt"; commit_all base
git -C "$REPO" tag base-tag
echo y >"$REPO/one.txt"; commit_all one
echo z >"$REPO/two.txt"; commit_all two
git -C "$REPO" branch topic
git -C "$REPO" checkout -q --detach HEAD~1
write_contracts '[{"name":"C1","touches_files":["one.txt"]}]'
scope base-tag topic
assert_eq "UNDECLARED two.txt" "$OUT_TXT" "T10 tag..branch (head not checked out): stdout"
scope "$(git -C "$REPO" rev-parse --short base-tag)" HEAD~0
assert_eq "0" "$RC" "T10 short sha..HEAD (one.txt only): exit"
scope topic~2 topic
assert_eq "UNDECLARED two.txt" "$OUT_TXT" "T10 ancestor syntax: stdout"
drop_repo

# T11: the gate reads the commits, not the checkout: dirty files are not charged
fixture src/a.sh
echo dirty >"$REPO/uncommitted.txt"
echo more >>"$REPO/src/a.sh"
write_contracts '[{"name":"C1","touches_files":["src/a.sh"]}]'
scope "$BASE"
assert_eq "" "$OUT_TXT" "T11 uncommitted work is not charged: stdout"
assert_eq "0" "$RC" "T11 uncommitted work is not charged: exit"
drop_repo

# T12: commits that change no file -> clean (base equal to head holds no commit
# and is `ERROR empty-range`, see empty-range.test.sh)
fixture src/a.sh
write_contracts '[{"name":"C1","touches_files":[]}]'
git -C "$REPO" commit -q --allow-empty -m "no files"
scope HEAD~1 HEAD
assert_eq "0" "$RC" "T12 empty range: exit"
assert_eq "" "$OUT_TXT" "T12 empty range: stdout"
drop_repo

# ==== ERROR: one line on stdout, exit 1 ====

fixture src/a.sh
write_contracts '[{"name":"C1","touches_files":["src/a.sh"]}]'

# err_case LABEL ARGS... : stdout is exactly one ERROR line, exit 1
err_case() {
  local label="$1"; shift
  OUT_TXT="$(bash "$SCOPE" "$@" 2>/dev/null)"
  RC=$?
  assert_eq "1" "$RC" "$label: exit"
  assert_eq "1" "$(printf '%s\n' "$OUT_TXT" | grep -c '')" "$label: one stdout line"
  case "$OUT_TXT" in "ERROR "?*) _assert_pass ;; *) _assert_fail "$label: not an ERROR line: [$OUT_TXT]" ;; esac
}

good=(--repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS")
err_case "E1 no arguments"
err_case "E2 no --repo" --base "$BASE" --head HEAD --contracts "$CONTRACTS"
err_case "E3 no --base" --repo "$REPO" --head HEAD --contracts "$CONTRACTS"
err_case "E4 no --head" --repo "$REPO" --base "$BASE" --contracts "$CONTRACTS"
err_case "E5 no --contracts" --repo "$REPO" --base "$BASE" --head HEAD
err_case "E6 unknown flag" "${good[@]}" --bogus
err_case "E7 flag without a value" --repo "$REPO" --base "$BASE" --head HEAD --contracts
err_case "E8 repo is not a directory" --repo "$REPO_TOP/nope" --base "$BASE" --head HEAD --contracts "$CONTRACTS"
err_case "E9 repo is not a git repo" --repo "$REPO_TOP" --base "$BASE" --head HEAD --contracts "$CONTRACTS"
err_case "E10 unresolvable base" --repo "$REPO" --base deadbeefdeadbeef --head HEAD --contracts "$CONTRACTS"
err_case "E11 unresolvable head" --repo "$REPO" --base "$BASE" --head no-such-branch --contracts "$CONTRACTS"
err_case "E12 base resolves to a tree, not a commit" --repo "$REPO" --base "HEAD^{tree}" --head HEAD --contracts "$CONTRACTS"
err_case "E13 contracts file missing" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/none.json"
printf 'not json' >"$REPO_TOP/bad.json"
err_case "E14 contracts not JSON" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/bad.json"
echo '{"schema_version":2,"contracts":[]}' >"$REPO_TOP/v2.json"
err_case "E15 schema_version 2" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/v2.json"
echo '{"schema_version":1,"contracts":{}}' >"$REPO_TOP/obj.json"
err_case "E16 contracts is not an array" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/obj.json"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' >"$REPO_TOP/notouch.json"
err_case "E17 a contract without touches_files" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/notouch.json"
echo '{"schema_version":1,"contracts":[{"name":"C1","touches_files":"src/a.sh"}]}' >"$REPO_TOP/strtouch.json"
err_case "E18 touches_files is a string" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/strtouch.json"

echo '{"schema_version":1,"contracts":[{"name":"C1","touches_files":[],"test_files":"t.sh"}]}' >"$REPO_TOP/strtest.json"
err_case "E18b test_files is a string" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/strtest.json"
echo '{"schema_version":1,"contracts":["C1"]}' >"$REPO_TOP/strc.json"
err_case "E18c a contract that is not an object" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/strc.json"
echo '{"schema_version":1,"contracts":[{"name":"C1","touches_files":["src/a.sh"],"test_files":["t.sh"]}]}' >"$REPO_TOP/okt.json"
bash "$SCOPE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/okt.json" >/dev/null 2>&1
assert_eq "0" "$?" "E18d optional test_files is accepted"

# E19: jq absent -> ERROR jq-missing, with nothing else on stdout
OUT_TXT="$(PATH="$(without_jq)" bash "$SCOPE" "${good[@]}" 2>/dev/null)"
RC=$?
assert_eq "ERROR jq-missing" "$OUT_TXT" "E19 jq missing: stdout"
assert_eq "1" "$RC" "E19 jq missing: exit"
# ... even with no arguments at all, and with no command but bash on PATH
OUT_TXT="$(PATH="$REPO_TOP/empty" "$(command -v bash)" "$SCOPE" 2>/dev/null)"
RC=$?
assert_eq "ERROR jq-missing" "$OUT_TXT" "E19 jq missing, bare PATH: stdout"
assert_eq "1" "$RC" "E19 jq missing, bare PATH: exit"
drop_repo

# ==== no side effects ====

# S1: checkout, index, branches, tags, stash and worktrees are as the gate found them,
# under every verdict
for verdict in clean allowlisted undeclared error; do
  new_repo
  echo keep >"$REPO/keep.txt"; commit_all base
  BASE="$(head_sha)"
  mkdir -p "$REPO/src"; echo a >"$REPO/src/a.sh"; echo '{}' >"$REPO/package.json"; echo r >"$REPO/src/rogue.sh"
  commit_all work
  dirty_repo
  case "$verdict" in
    clean)       write_contracts '[{"name":"C1","touches_files":["src/a.sh","package.json","src/rogue.sh"]}]' ;;
    allowlisted) write_contracts '[{"name":"C1","touches_files":["src/a.sh","src/rogue.sh"]}]' ;;
    undeclared)  write_contracts '[{"name":"C1","touches_files":["src/a.sh"]}]' ;;
    error)       printf 'nope' >"$CONTRACTS" ;;
  esac
  snapshot >/dev/null    # git status may refresh the index once; settle it
  before="$(snapshot)"
  scope "$BASE"
  after="$(snapshot)"
  assert_eq "$before" "$after" "S1 $verdict: checkout, index, refs, stash and worktrees unchanged (rc=$RC)"
  drop_repo
done
