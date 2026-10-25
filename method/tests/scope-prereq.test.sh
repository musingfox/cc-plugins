#!/usr/bin/env bash
# The scope gate charges a builder only for the commits in base..head. A builder
# that merged a prerequisite's checkpoint puts another builder's commits in its
# history; the caller keeps them out of the charge by passing the merge commit as
# --base. Pass the original base and they are in range, so they are charged: the
# gate has no list of checkpoints to subtract, and says so by naming the files.
#
# Real git repo, real scope-gate.sh -- the bug lives in the choice of git command.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

SCOPE="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)/scope-gate.sh"

# build_fixture ROGUE_FILE   (empty = the builder stays inside its declared scope)
# Leaves REPO on main: base, a merge of the prerequisite's checkpoint (src/lib.py),
# then the builder's own src/app.py and, when given, the rogue file.
# Sets BASE (before the merge) and MERGE (the merge commit).
build_fixture() {
  local rogue="$1"
  new_repo
  write_contracts '[{"name":"C2","touches_files":["src/app.py"]}]'
  echo base >"$REPO/base.txt"; commit_all base
  BASE="$(head_sha)"

  git -C "$REPO" checkout -qb prereq
  mkdir -p "$REPO/src"; echo "def api(): pass" >"$REPO/src/lib.py"; commit_all "prereq: interface"
  git -C "$REPO" tag cf-checkpoint-A
  git -C "$REPO" checkout -q main
  git -C "$REPO" merge -q --no-ff cf-checkpoint-A -m "merge checkpoint"
  MERGE="$(head_sha)"

  mkdir -p "$REPO/src"; echo app >"$REPO/src/app.py"; commit_all "builder: app"
  if [ -n "$rogue" ]; then
    mkdir -p "$(dirname "$REPO/$rogue")"; echo rogue >"$REPO/$rogue"; commit_all "builder: rogue"
  fi
}

# scope BASE -> OUT_TXT, RC
scope() {
  OUT_TXT="$(bash "$SCOPE" --repo "$REPO" --base "$1" --head HEAD --contracts "$CONTRACTS" 2>&1)"
  RC=$?
}

# T1: based after the checkpoint merge, the prerequisite's files are not charged
build_fixture ""
scope "$MERGE"
assert_eq "0" "$RC" "T1 base at the merge: a dependent builder passes ($OUT_TXT)"
assert_eq "" "$OUT_TXT" "T1 base at the merge: nothing is reported"
drop_repo

# T2: the builder's own undeclared file is still caught, and the prerequisite's is not named
build_fixture "src/rogue.py"
scope "$MERGE"
assert_eq "2" "$RC" "T2 own undeclared file exits 2"
assert_eq "UNDECLARED src/rogue.py" "$OUT_TXT" "T2 names the builder's own file only"
drop_repo

# T3: based before the merge, the merged-in commits are in range and charged;
# the merge commit itself adds no path of its own
build_fixture ""
scope "$BASE"
assert_eq "2" "$RC" "T3 base before the merge: the checkpoint's commits are in range"
assert_eq "UNDECLARED src/lib.py" "$OUT_TXT" "T3 only the merged-in file, not the merge commit"
drop_repo

# T4: the CLI as a caller outside any flow consumes it -- exit 2 plus a
# machine-readable UNDECLARED line, the only two signals the gate gives
build_fixture "src/rogue.py"
scope "$MERGE"
assert_eq "2" "$RC" "T4 undeclared file exits 2"
assert_eq "UNDECLARED src/rogue.py" "$OUT_TXT" "T4 stdout names the undeclared file"
drop_repo

# T5: a clean builder exits 0 and says nothing
build_fixture ""
scope "$MERGE"
assert_eq "0" "$RC" "T5 clean builder exits 0"
assert_eq "" "$OUT_TXT" "T5 clean builder prints nothing"
drop_repo
