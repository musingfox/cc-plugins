#!/usr/bin/env bash
# Shared stubbed fixture for tests that drive the real cf-pi-run.sh.
#
# Every sibling cf-pi-*.sh the lifecycle calls through $SCRIPTS (and sleep/git)
# is a stub that counts its calls into $FLOW/<name>.count, so a test can assert
# a script was never reached by asserting its counter file does not exist.
# cf-pi-prepare.sh, cf-pi-scope.sh and cf-pi-revert-gate.sh stay real.
#
# Usage:  . "$CF_TESTS_DIR/lib/run-fixture.sh"
#         fx_build                 # sets FLOW SHARD STUBS RUNNER
#         fx_test_mode red         # green | red | nomarker  (cf-pi-test.sh stub)
#         fx_report valid          # valid | late | none     (implement-report.md)
#         fx_escalate              # writes escalate.md
#         fx_stale_outcome         # pre-seeds last round's outcome.md
#         fx_run --gates-only "$SHARD" goal none "$RUNNER"   # sets RC OUT
#         fx_mutant 's/old/new/'   # sets MUT: cf-pi-run.sh with one perl change
#         FX_RUN_SCRIPT="$MUT" fx_run ...   # runs that copy instead of the real one
#         fx_clean
# FX_DISPATCH_REPORT=1 before fx_build makes the dispatch stub write a valid report;
# FX_WORKTREE_FAILS=1 makes the worktree stub exit 1 with no output.

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

_fx_stub() { printf '#!/bin/bash\n%s\n' "$2" > "$STUBS/$1"; }

fx_build() {
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/A"
  STUBS="$FLOW/stubs"
  RUNNER="$STUBS/runner"
  mkdir -p "$SHARD/work" "$STUBS"

  cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"]}}}
JSON
  cat > "$FLOW/contracts.json" <<'JSON'
{"schema_version": 1, "contracts": [{"name": "C1", "touches_files": ["src/x.ts"]}]}
JSON
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

  local wt_exit=0
  [ -z "${FX_WORKTREE_FAILS:-}" ] || wt_exit=1
  _fx_stub cf-pi-worktree.sh "echo 1 >> \"$FLOW/worktree.count\"; exit $wt_exit"
  _fx_stub cf-pi-brief.sh "echo 1 >> \"$FLOW/brief.count\"; exit 0"
  _fx_stub cf-pi-probe.sh "echo 1 >> \"$FLOW/probe.count\"; echo OK"
  _fx_stub cf-pi-poll.sh 'echo "STATUS=OK"'
  _fx_stub cf-pi-stop.sh 'exit 0'
  _fx_stub cf-pi-postmortem.sh 'echo pm'
  _fx_stub sleep 'exit 0'
  _fx_stub git 'exit 0'

  cat > "$STUBS/cf-pi-dispatch.sh" <<DISPATCH
#!/bin/bash
echo 1 >> "$FLOW/dispatch.count"
if [ -n "${FX_DISPATCH_REPORT:-}" ]; then
  printf '## Summary\nDid the work.\n\n## Completed\n- Implemented the thing _(contract: C1)_\n' > "$SHARD/implement-report.md"
fi
echo 12345
DISPATCH

  cat > "$STUBS/cf-pi-test.sh" <<TESTSTUB
#!/bin/bash
echo 1 >> "$FLOW/test.count"
case "\$(cat "$FLOW/test.mode")" in
  green)    echo "test_exit=0"; exit 0 ;;
  red)      echo "test_exit=1"; exit 1 ;;
  nomarker) echo "runner blew up"; exit 1 ;;
esac
TESTSTUB

  # The suite the revert gate runs: green on its control run, red once the
  # contract's implementation is reverted.
  cat > "$RUNNER" <<RUNNERSTUB
#!/bin/bash
echo 1 >> "$FLOW/runner.count"
[ "\$(wc -l < "$FLOW/runner.count")" -eq 1 ]
RUNNERSTUB
  chmod +x "$STUBS"/*
  fx_test_mode green
}

fx_test_mode() { printf '%s\n' "$1" > "$FLOW/test.mode"; }

fx_report() {
  case "$1" in
    valid)
      printf '## Summary\nDid the work.\n\n## Completed\n- Implemented the thing _(contract: C1)_\n' > "$SHARD/implement-report.md" ;;
    late)
      { printf '## Summary\n'; for _ in $(seq 2 24); do echo filler; done
        printf '## Completed\n- Implemented the thing _(contract: C1)_\n'; } > "$SHARD/implement-report.md" ;;
    none) rm -f "$SHARD/implement-report.md" ;;
  esac
}

fx_escalate() { printf '## Blocker\nCannot proceed.\n' > "$SHARD/escalate.md"; }

fx_stale_outcome() { printf '## Status\nFAIL\n\n## Reason\nstall\n' > "$SHARD/outcome.md"; }

# fx_run ARGS... : runs cf-pi-run.sh (or $FX_RUN_SCRIPT) with the stubs first on
# PATH. Sets RC, OUT (stdout) and leaves stderr in $FLOW/run.err.
fx_run() {
  OUT="$(PATH="$STUBS:$PATH" bash "${FX_RUN_SCRIPT:-$REAL_SCRIPTS/cf-pi-run.sh}" "$@" 2>"$FLOW/run.err")"
  RC=$?
}

# fx_script_dir DIR : links into DIR every sibling cf-pi-run.sh resolves through
# $SCRIPT_DIR, so a copy of cf-pi-run.sh placed there runs against them. This is
# the one list of those siblings; a new $SCRIPT_DIR call adds its script here.
fx_script_dir() {
  local s
  mkdir -p "$1"
  for s in cf-pi-env.sh cf-pi-prepare.sh cf-pi-scope.sh cf-pi-revert-gate.sh; do
    ln -sf "$REAL_SCRIPTS/$s" "$1/$s"
  done
}

# fx_mutant PERL_SUBSTITUTION : MUT=$FLOW/mut/cf-pi-run.sh with that one change.
# Asserts the change applied, so a stale pattern cannot leave a real copy behind.
fx_mutant() {
  local run="$REAL_SCRIPTS/cf-pi-run.sh" applied=yes
  fx_script_dir "$FLOW/mut"
  MUT="$FLOW/mut/cf-pi-run.sh"
  perl -0777 -pe "$1" "$run" >"$MUT"
  cmp -s "$run" "$MUT" && applied=no
  assert_eq "yes" "$applied" "mutation applies: $1"
}

fx_last() { printf '%s\n' "$OUT" | tail -1; }

fx_exists() { [ -e "$1" ] && echo present || echo absent; }

fx_clean() { rm -rf "$FLOW"; }
