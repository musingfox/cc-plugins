#!/usr/bin/env bash
# A worker that dies on a provider error after it has done the work is judged by
# the gates, not failed as infrastructure.
#
# 2026-09-29: grok wrote the fix and passed its own tests, then its final
# message hit Cursor's retryable `resource_exhausted`; pi exited rc=1 and the
# poll said FAIL. Routed as an infrastructure FAIL, cf re-launches the shard and
# redoes finished work. When the shard holds a report or new commits, the gates
# decide instead. With neither, it is still an infrastructure FAIL, and a quota
# wall is still a wall.
#
#   - rc=1 + provider error, report written       -> gates run, no rc-fail
#   - rc=1 + provider error, commits but no report -> gates run (gate 1 resumes for the report)
#   - rc=1 + provider error, nothing produced     -> FAIL rc-fail
#   - terminal=error QUOTA, report written        -> FAIL QUOTA

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
assert_not_contains() { # haystack needle msg
  case "$1" in *"$2"*) _assert_fail "$3: [$2] found in [$1]" ;; *) _assert_pass ;; esac
}

ERR='cause:connect error resource_exhausted: error [details: aiserver.v1.errordetails: {\'

run_shard() { # $1 = poll line, $2 = write report (1/0), $3 = new commits on the shard (count)
  local poll_line="$1" write_report="$2" commits="$3" FLOW SHARD STUBS
  FLOW="$(mktemp -d)"; SHARD="$FLOW/shards/A"; STUBS="$FLOW/stubs"
  mkdir -p "$SHARD/work" "$STUBS"
  printf '{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"]}}}\n' > "$FLOW/shards.json"
  cat > "$SHARD/env.sh" <<ENV
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
PLUGIN_ROOT="$FLOW"
SCRIPTS="$STUBS"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
PI_DISPATCH_CMD=""
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$FLOW"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
ENV
  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh cf-pi-scope.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  {
    printf '#!/bin/bash\n'
    if [ "$write_report" = 1 ]; then
      printf 'printf "## Summary\\nDid the work.\\n\\n## Completed\\n- Implemented the thing _(contract: C1)_\\n" > "%s/implement-report.md"\n' "$SHARD"
    fi
    printf 'echo 12345\n'
  } > "$STUBS/cf-pi-dispatch.sh"
  printf '#!/bin/bash\necho %q\n' "$poll_line" > "$STUBS/cf-pi-poll.sh"
  printf '#!/bin/bash\necho "test_exit=0"; echo "test_counts=3 passed"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  # The shard's tip moves only once the worker has run and committed.
  cat > "$STUBS/git" <<GIT
#!/bin/bash
case " \$* " in
  *" rev-parse HEAD "*) if [ -f "$SHARD/dispatched" ] && [ "$commits" -gt 0 ]; then echo tip; else echo base; fi ;;
esac
exit 0
GIT
  sed -i '' "s|^echo 12345|touch \"$SHARD/dispatched\"; echo 12345|" "$STUBS/cf-pi-dispatch.sh"
  chmod +x "$STUBS"/*
  PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
    > "$FLOW/run.log" 2>&1
  printf '%s' "$FLOW"
}

outcome() { cat "$1/shards/A/outcome.md" 2>/dev/null; }

F="$(run_shard "STATUS=FAIL OUTPUT=/x/result.md exit rc=1 66s model=cursor/grok-4.7-medium $ERR" 1 2)"
assert_not_contains "$(outcome "$F")" "rc-fail" "report + commits: not failed as infrastructure"
assert_contains "$(cat "$F/run.log")" "gate 1 ok" "report + commits: the gates judge the work"
assert_contains "$(cat "$F/run.log")" "gate 3 ok" "report + commits: the suite ran"
rm -rf "$F"

F="$(run_shard "STATUS=FAIL OUTPUT=/x/result.md exit rc=1 66s $ERR" 0 2)"
assert_contains "$(cat "$F/run.log")" "after producing work; the gates judge it" "commits only: not failed as infrastructure"
assert_contains "$(cat "$F/run.log")" "asking pi for the report only" "commits only: gate 1 asks for the report"
rm -rf "$F"

F="$(run_shard "STATUS=FAIL OUTPUT=/x/result.md exit rc=1 66s $ERR" 0 0)"
assert_contains "$(outcome "$F")" "rc-fail" "nothing produced: still an infrastructure FAIL"
rm -rf "$F"

F="$(run_shard "STATUS=FAIL OUTPUT=/x/result.md ERROR QUOTA terminal=error 40s cause:out of credits" 1 2)"
assert_contains "$(outcome "$F")" "QUOTA" "quota wall with work done: still a wall"
rm -rf "$F"
