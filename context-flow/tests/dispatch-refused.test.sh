#!/usr/bin/env bash
# A dispatch that pi-dispatch refuses ends the shard as FAIL dispatch-refused.
#
# pi-dispatch.sh refuses before launching (exit 2) with a `pi-dispatch:` line
# on stderr. Under set -e that exit used to end cf-pi-run.sh as an unexplained
# outcome-missing carrying rc 2, the NEEDS_REPLAN code. The outcome must name
# the refusal line and exit 1, at the first dispatch and at a re-brief alike.
#
# All sibling cf-pi-*.sh scripts (and `sleep`/`git`) are stubbed; the real
# cf-pi-run.sh under scripts/ is the unit under test.

CF_TESTS_DIR="${CF_TESTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# build_fixture DISPATCH_BODY
# DISPATCH_BODY runs inside the dispatch stub after it counts itself; $n is the
# 1-based dispatch number. Sets: FLOW, SHARD, STUBS
build_fixture() {
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/A"
  STUBS="$FLOW/stubs"
  mkdir -p "$SHARD" "$STUBS"

  cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"]}}}
JSON

  cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
PLUGIN_ROOT="$FLOW"
SCRIPTS="$STUBS"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
PI_PROVIDER=""
PI_MODEL=""
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$FLOW"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF

  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"

  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/dispatch.count"
n=\$(wc -l < "$FLOW/dispatch.count")
$1
EOF

  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
  chmod +x "$STUBS"/*
}

run_shard() {
  PATH="$STUBS:$PATH" PI_RUNS_DIR="${PI_RUNS_DIR:-$FLOW/pi-runs}" \
    bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" > "$FLOW/run.log" 2>&1
}

# section NAME: the line after `## NAME` in outcome.md
section() { sed -n "/^## $1\$/{n;p;q;}" "$SHARD/outcome.md" 2>/dev/null; }

count_of() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }

REFUSAL='pi-dispatch: provider openai is pinned without a model (from PI_PROVIDER). Set PI_MODEL too.'

# ---- T1: the first dispatch is refused -> FAIL naming the refusal, rc 1 ----

build_fixture "echo 'some banner' >&2; echo '$REFUSAL' >&2; exit 2"
run_shard; rc=$?
assert_eq "1" "$rc" "T1: a refusal exits 1, not the NEEDS_REPLAN code 2"
assert_eq "FAIL" "$(section Status)" "T1: Status is FAIL"
assert_eq "dispatch-refused" "$(section Reason)" "T1: Reason is dispatch-refused"
assert_contains "$(section Cause)" "pi-dispatch: provider openai is pinned without a model" \
  "T1: Cause is the pi-dispatch refusal line"
case "$(section Cause)" in
  "pi-dispatch: provider openai is pinned without a model"*) _assert_pass ;;
  *) _assert_fail "T1: Cause does not start with the refusal line: [$(section Cause)]" ;;
esac
assert_contains "$(cat "$SHARD/outcome.md")" "(all): dispatch refused (rc=2)" \
  "T1: Affected names the dispatch exit code"
assert_eq "0" "$(grep -c 'outcome-missing' "$SHARD/outcome.md" || true)" \
  "T1: the outcome is not the unexplained outcome-missing"
rm -rf "$FLOW"

# ---- T2: the gate-1 re-brief is refused -> same FAIL after 2 dispatches ----

build_fixture "if [ \"\$n\" -ge 2 ]; then echo '$REFUSAL' >&2; exit 2; fi; echo 12345"
run_shard; rc=$?
assert_eq "1" "$rc" "T2: a refused re-brief exits 1"
assert_eq "dispatch-refused" "$(section Reason)" "T2: Reason is dispatch-refused"
assert_eq "2" "$(count_of "$FLOW/dispatch.count")" "T2: the refusal came on the second dispatch"
rm -rf "$FLOW"

# ---- T3: no pi-dispatch line -> Cause is the wrapper's own last line ----

build_fixture "echo 'cf-pi-dispatch: cannot resolve canonical pi-dispatch/scripts dir' >&2; exit 1"
run_shard; rc=$?
assert_eq "1" "$rc" "T3: a wrapper failure exits 1"
assert_eq "cf-pi-dispatch: cannot resolve canonical pi-dispatch/scripts dir" "$(section Cause)" \
  "T3: Cause is the wrapper's line"
rm -rf "$FLOW"

# ---- T4: a successful dispatch still shows its stderr ----

build_fixture "echo 'pi-dispatch: warning: x' >&2; echo 12345"
run_shard
assert_contains "$(cat "$FLOW/run.log")" "pi-dispatch: warning: x" \
  "T4: a successful dispatch's stderr reaches the task log"
rm -rf "$FLOW"
