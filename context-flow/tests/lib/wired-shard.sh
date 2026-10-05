#!/usr/bin/env bash
# Shared real-git harness for tests that drive cf-pi-run.sh with no stubs: a host
# repo, a flow session sharded by the real cf-pi-shard.sh, and shard A prepared
# by the real --prepare-only, then one commit and a report claiming C1.
#
# Usage:  . "$CF_TESTS_DIR/lib/wired-shard.sh"
#         wired_build                          # sets TMP REPO FLOW SHARD W BASE_SHA PREP_RC
#         wired_gates SCRIPT RUNNER            # --gates-only from the host repo; sets RC
#         wired_clean
# BASE_SHA is the host HEAD before prepare; PREP_RC is the --prepare-only exit.
# Logs land in $TMP/prepare.log and $TMP/gates.log.

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

wired_build() {
  TMP="$(mktemp -d)"
  REPO="$TMP/repo"
  FLOW="$TMP/flow"
  mkdir -p "$REPO" "$FLOW"
  git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
  git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
  echo base > "$REPO/base.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm base
  cat > "$FLOW/contracts.json" <<'JSON'
{"schema_version": 1, "flow_id": "t",
 "contracts": [{"name": "C1", "touches_files": ["src/x.txt", "tests/x.test.sh"]}]}
JSON
  cat > "$FLOW/env.sh" <<ENV
SESSION="$FLOW"
SESSION_BASENAME="$(basename "$FLOW")"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$REAL_SCRIPTS"
PI_PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
ENV
  touch "$FLOW/cleanup.sh"
  "$REAL_SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
  SHARD="$FLOW/shards/A"
  BASE_SHA="$(git -C "$REPO" rev-parse HEAD)"
  ( cd "$REPO" && bash "$REAL_SCRIPTS/cf-pi-run.sh" --prepare-only "$SHARD" goal none 'bash tests/x.test.sh' ) \
    > "$TMP/prepare.log" 2>&1
  PREP_RC=$?
  W="$SHARD/work"
  mkdir -p "$W/src" "$W/tests"
  echo hello > "$W/src/x.txt"
  echo 'grep -q hello src/x.txt' > "$W/tests/x.test.sh"
  git -C "$W" add -A && git -C "$W" commit -qm "add x"
  printf '## Summary\nDone.\n\n## Completed\n- Wrote x _(contract: C1)_\n' > "$SHARD/implement-report.md"
}

wired_gates() {
  ( cd "$REPO" && bash "$1" --gates-only "$SHARD" goal none "$2" ) > "$TMP/gates.log" 2>&1
  RC=$?
}

wired_clean() {
  git -C "$REPO" worktree remove --force "$W" >/dev/null 2>&1
  rm -rf "$TMP"
}
