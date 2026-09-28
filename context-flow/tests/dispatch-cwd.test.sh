#!/usr/bin/env bash
# dispatch-cwd.test.sh — the cf → pi-dispatch seam: a shard worker is launched
# inside its worktree. Runs the REAL cf-pi-dispatch.sh and the REAL canonical
# pi-dispatch.sh; only the pi binary is a shim that records where it started.
#
# The measured incident: workers inherited cf's own cwd (the human's checkout)
# and a bare `git commit` landed there.

. "$CF_TESTS_DIR/lib/assert.sh"

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd -P)"
FLOW="$(mktemp -d)"; FLOW="$(cd "$FLOW" && pwd -P)"
SHARD="$FLOW/shards/A"
mkdir -p "$SHARD/work" "$FLOW/runs"
export PI_RUNS_DIR="$FLOW/runs"

cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
PLUGIN_ROOT="$CF_ROOT"
SCRIPTS="$CF_ROOT/scripts"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$FLOW"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF
printf 'do nothing\n' > "$SHARD/implement-brief.md"

cat > "$FLOW/pi-shim" <<'EOF'
#!/usr/bin/env bash
printf 'CWD=%s\nPATH_HEAD=%s\n' "$(pwd -P)" "${PATH%%:*}"
EOF
chmod +x "$FLOW/pi-shim"

# Inside a pi worker the shell is already sandboxed and macOS refuses to nest
# one, so the stand-in worker would never start. This test pins cwd and PATH,
# not the fence (writable-seam does), so run the dispatch unsandboxed there.
sandbox-exec -p '(version 1)(allow default)' /usr/bin/true 2>/dev/null || export PI_SANDBOX=0

# cf's own cwd is the "human's checkout"; the worker must not start there.
CHECKOUT="$FLOW/checkout"; mkdir -p "$CHECKOUT"
pid="$(cd "$CHECKOUT" && PI_DISPATCH_CMD="$FLOW/pi-shim" CLAUDE_PLUGIN_ROOT="$CF_ROOT" bash "$CF_ROOT/scripts/cf-pi-dispatch.sh" "$SHARD")"
rundir="$(cat "$SHARD/pi-rundir")"
for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done

assert_eq "$SHARD/work" "$(sed -n 's/^CWD=//p' "$rundir/result.md")" "worker starts inside the shard worktree, not cf's cwd"
assert_contains "$(sed -n 's/^PATH_HEAD=//p' "$rundir/result.md")" "/shims" "worker's PATH leads with the git shim"
assert_contains "$(cat "$rundir/routing")" "CWD=$SHARD/work" "routing records the worktree for resume"
rm -rf "$FLOW"
