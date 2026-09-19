#!/usr/bin/env bash
# writable-seam.test.sh — a cf shard's pi worker may write its report and
# escalate files beside the worktree, and nothing else in the shard session.
# Runs the REAL cf-pi-dispatch.sh and the REAL canonical dispatch script under
# the real macOS sandbox; only the pi binary is a stand-in that tries the writes.
#
# The session lives under /tmp/cf-writable-*, never under TMPDIR: the sandbox
# allows the per-user temp dir wholesale, which would make every write pass.
# It is handed over in its /tmp spelling, so the /private/tmp canonicalization
# is part of what is tested.

. "$CF_TESTS_DIR/lib/assert.sh"

if [ "$(uname -s)" != Darwin ] || ! command -v sandbox-exec >/dev/null 2>&1; then
  echo "  skip - writable-seam needs macOS sandbox-exec"
  exit 0
fi

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd -P)"
SHARD="$(mktemp -d /tmp/cf-writable-XXXX)"
SCRATCH="$(mktemp -d)"
cleanup() { local rc=$?; rm -rf "$SHARD" "$SCRATCH"; return "$rc"; }
trap 'cleanup; _assert_summary_on_exit' EXIT

canon() { (cd "$1" 2>/dev/null && pwd -P) || true; }
shard_c="$(canon "$SHARD")"
for d in "${TMPDIR:-}" "$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null || true)"; do
  d_c="$(canon "${d:-/nonexistent}")"
  [ -n "$d_c" ] || continue
  case "$shard_c/" in
    "${d_c%/}/"*) _assert_fail "precondition: session $shard_c is under the sandbox-allowed temp dir $d_c"; exit 1 ;;
  esac
done

export PI_RUNS_DIR="$SCRATCH/runs"
mkdir -p "$SHARD/work" "$PI_RUNS_DIR"

cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-writable"
PLUGIN_ROOT="$CF_ROOT"
SCRIPTS="$CF_ROOT/scripts"
FLOW_SESSION="$SHARD"
SHARD_ID="A"
PI_PROVIDER="stub"
PI_MODEL="stub"
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$SHARD"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF
printf 'do nothing\n' > "$SHARD/implement-brief.md"
printf 'continue\n' > "$SHARD/resume.md"

cat > "$SCRATCH/pi-writer" <<'EOF'
#!/usr/bin/env bash
try() { { : > "$PI_CWD/../$2" && echo body >> "$PI_CWD/../$2"; } 2>/dev/null && echo "$1=written" || echo "$1=denied"; }
try REPORT implement-report.md
try ESCALATE escalate.md
try OTHER other.md
EOF
chmod +x "$SCRATCH/pi-writer"

dispatch() { # usage: dispatch [RESUME_PROMPT_FILE] -> prints the run's RUNDIR
  local rundir
  PI_BIN="$SCRATCH/pi-writer" CLAUDE_PLUGIN_ROOT="$CF_ROOT" \
    bash "$CF_ROOT/scripts/cf-pi-dispatch.sh" "$SHARD" "$@" >/dev/null 2>>"$SCRATCH/dispatch.err" || return 1
  rundir="$(cat "$SHARD/pi-rundir")"
  for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done
  printf '%s\n' "$rundir"
}
field() { sed -n "s/^$2=//p" "$1/result.md"; }

rundir="$(dispatch)"
assert_eq "written" "$(field "$rundir" REPORT)" "worker writes the report beside the worktree"
assert_eq "written" "$(field "$rundir" ESCALATE)" "worker writes the escalate file beside the worktree"
assert_eq "denied" "$(field "$rundir" OTHER)" "any other file in the session stays denied"
assert_exit 0 test -f "$SHARD/implement-report.md"
assert_exit 0 test -f "$SHARD/escalate.md"
assert_exit 1 test -e "$SHARD/other.md"

routing="$(cat "$rundir/routing" 2>/dev/null)"
assert_contains "$routing" "WRITABLE=/private/tmp/cf-writable-" "routing records the canonical spelling"
assert_contains "$routing" "/implement-report.md" "routing names the report"
assert_contains "$routing" "/escalate.md" "routing names the escalate file"

rm -f "$SHARD/implement-report.md"
rundir2="$(dispatch "$SHARD/resume.md")"
assert_eq "written" "$(field "$rundir2" REPORT)" "a resumed worker can still write the report"
assert_exit 0 test -f "$SHARD/implement-report.md"

[ "$__ASSERT_FAIL" -eq 0 ] || sed 's/^/    dispatch stderr: /' "$SCRATCH/dispatch.err"
