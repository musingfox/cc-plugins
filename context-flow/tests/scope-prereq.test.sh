#!/usr/bin/env bash
# Step 10 (actual ⊆ declared) must charge a shard only for its OWN commits.
#
# Step 1b merges each prerequisite's checkpoint into the dependent shard's
# worktree, which puts another shard's commits in this shard's history. The
# file-graph premise guarantees those files are NOT in this shard's declared
# set, so a naive BASE_HEAD..HEAD read makes every dependent shard fail scope
# on work it never did.
#
# Unlike file-audit.test.sh (which pins the comm -23 semantics over synthetic
# lists), this drives the REAL cf-pi-run.sh over a REAL git repo -- the bug
# lives in the choice of git command, so nothing less can catch it.
# Sibling scripts + sleep are stubbed; git deliberately is not.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# build_fixture ROGUE_FILE   (empty = shard stays inside its declared scope)
# Sets FLOW/SHARD/STUBS; leaves $SHARD/work a repo where shard B has committed
# its own file and shard A's checkpoint tag is ready for step 1b to merge.
build_fixture() {
  local rogue="$1"
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/B"
  STUBS="$FLOW/stubs"
  WORK="$SHARD/work"
  mkdir -p "$SHARD" "$STUBS" "$WORK"

  # A provides src/lib.py; B declares only src/app.py and depends on A.
  cat > "$FLOW/shards.json" <<'JSON'
{"groups": {
  "A": {"contracts": ["C1"], "files": ["src/lib.py"]},
  "B": {"contracts": ["C2"], "files": ["src/app.py"], "depends_on": ["A"]}
}}
JSON
  cat > "$FLOW/dispatch-state.json" <<'JSON'
{"checkpoints": {"A": "cf-checkpoint-A"}}
JSON

  git -C "$WORK" init -q -b main
  git -C "$WORK" config user.email t@t; git -C "$WORK" config user.name t
  echo base > "$WORK/base.txt"
  git -C "$WORK" add -A; git -C "$WORK" commit -qm base
  BASE_HEAD="$(git -C "$WORK" rev-parse HEAD)"

  # Shard A's PASS checkpoint: the interface B consumes.
  git -C "$WORK" checkout -qb cf-shard-A
  mkdir -p "$WORK/src"; echo "def api(): pass" > "$WORK/src/lib.py"
  git -C "$WORK" add -A; git -C "$WORK" commit -qm "A: interface"
  git -C "$WORK" tag cf-checkpoint-A

  # Shard B's own work, on its own branch forked from BASE_HEAD.
  git -C "$WORK" checkout -q -b cf/test-shard-B "$BASE_HEAD"
  mkdir -p "$WORK/src"; echo "app" > "$WORK/src/app.py"
  git -C "$WORK" add -A; git -C "$WORK" commit -qm "B: app"
  if [ -n "$rogue" ]; then
    mkdir -p "$(dirname "$WORK/$rogue")"; echo rogue > "$WORK/$rogue"
    git -C "$WORK" add -A; git -C "$WORK" commit -qm "B: rogue"
  fi

  cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-B"
PLUGIN_ROOT="$FLOW"
SCRIPTS="$STUBS"
FLOW_SESSION="$FLOW"
SHARD_ID="B"
PI_PROVIDER=""
PI_MODEL=""
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$WORK"
BASE_BRANCH="main"
BASE_HEAD="$BASE_HEAD"
EOF

  cat > "$SHARD/implement-report.md" <<'EOF'
## Summary
Did the work.

## Completed
- Implemented the thing _(contract: C2)_
EOF

  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n'            > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n'          > "$STUBS/cf-pi-postmortem.sh"
  printf '#!/bin/bash\necho 12345\n'         > "$STUBS/cf-pi-dispatch.sh"
  printf '#!/bin/bash\necho "STATUS=OK"\n'   > "$STUBS/cf-pi-poll.sh"
  printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\nexit 0\n'             > "$STUBS/sleep"
  chmod +x "$STUBS"/*
  export PI_RUNS_DIR="$FLOW/runs"   # keep write_outcome off the real ledger
}

# T1: prerequisite files must not count as this shard's undeclared touches.
build_fixture ""
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" goal none true \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "yes" "$([ -f "$WORK/src/lib.py" ] && echo yes || echo no)" \
  "T1 step 1b did merge the prerequisite (bug is reachable)"
assert_eq "0" "$rc" "T1 dependent shard PASSes despite prerequisite files in its history"
assert_contains "$(cat "$SHARD/outcome.md")" "PASS" "T1 outcome is PASS"
case "$(cat "$SHARD/outcome.md")" in
  *undeclared_file_touched*) assert_eq "no-violation" "scope-violation" "T1 must not report a scope violation" ;;
  *) assert_eq ok ok "T1 no scope violation reported" ;;
esac
rm -rf "$FLOW"

# T2: the shard's OWN undeclared file is still caught -- the fix narrows the
# exclusion to prerequisites, it does not disarm the gate.
build_fixture "src/rogue.py"
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" goal none true \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "2" "$rc" "T2 own undeclared file still exits 2 (NEEDS_REPLAN)"
assert_contains "$(cat "$SHARD/outcome.md")" "undeclared_file_touched" "T2 reason is undeclared_file_touched"
assert_contains "$(cat "$SHARD/outcome.md")" "src/rogue.py" "T2 names the shard's own undeclared file"
case "$(sed -n '/^## Undeclared files/,/^$/p' "$SHARD/outcome.md")" in
  *src/lib.py*) assert_eq "no-lib" "lib-in-undeclared" "T2 prerequisite file must not appear in undeclared" ;;
  *) assert_eq ok ok "T2 prerequisite file absent from undeclared list" ;;
esac
rm -rf "$FLOW"

# T3: the gate's CLI contract, as the Claude-fallback path (cf.md §3.6) consumes
# it — exit 2 plus a machine-readable UNDECLARED line on stdout. The fallback
# has no cf-pi-run.sh around it, so these two signals are all it gets.
build_fixture "src/rogue.py"
set +e
scope_out=$(bash "$REAL_SCRIPTS/cf-pi-scope.sh" "$SHARD" 2>&1)
scope_rc=$?
set -e
assert_eq "2" "$scope_rc" "T3 undeclared file exits 2"
assert_eq "UNDECLARED src/rogue.py" "$scope_out" "T3 stdout names the undeclared file"
rm -rf "$FLOW"

# T4: clean shard exits 0 and says nothing.
build_fixture ""
set +e
scope_out=$(bash "$REAL_SCRIPTS/cf-pi-scope.sh" "$SHARD" 2>&1)
scope_rc=$?
set -e
assert_eq "0" "$scope_rc" "T4 clean shard exits 0"
assert_eq "" "$scope_out" "T4 clean shard prints nothing"
rm -rf "$FLOW"
