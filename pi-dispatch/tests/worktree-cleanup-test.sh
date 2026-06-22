#!/usr/bin/env bash
# worktree-cleanup-test.sh — behavioral tests for pi-worktree.sh create+clean.
#
# Pins EX-E2 (a)(b)(c)(d)(d-benign):
#   (a) confirm-poll reads pgid from the frozen rundir-file path CONTENTS (EX-C2)
#   (b) kill-confirm BEFORE remove ordering race (EX-D1) + trace-based confirm-poll
#       order assertion against delete-poll mutant (EX-B-SHARP-MUTANT)
#   (c) cleanup block has no unbound variable under env -i bash -u (EX-C1c/EX-C3)
#   (d) injection guard for all 6 bakeable params: breakout payload must not land
#       in generated cleanup — covers matrix (EX-D-MATRIX) + newline vector (EX-D-NEWLINE)
#   (d-benign) anti-overcorrection: metachar-bearing path preserved exactly (EX-D-BENIGN)
#
# Pure-local, real git in mktemp repos. No Pi, no network.
# Convention: ok/bad lines; final "pass: N, fail: 0"; exit nonzero iff any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WT="$SCRIPT_DIR/../scripts/pi-worktree.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# Canonicalize path (resolve macOS /var -> /private/var symlinks).
# ---------------------------------------------------------------------------
canon() {
  local p="$1"
  if [ -d "$p" ]; then
    ( cd "$p" 2>/dev/null && pwd -P ) || echo "$p"
  else
    local d b
    d="$(dirname "$p")"; b="$(basename "$p")"
    if [ -d "$d" ]; then echo "$(cd "$d" && pwd -P)/$b"; else echo "$p"; fi
  fi
}

# Is work_path registered in repo_root's worktree list?
wt_registered() {
  local repo_root="$1" work_path="$2"
  local want; want="$(canon "$work_path")"
  git -C "$repo_root" worktree list --porcelain 2>/dev/null \
    | sed -n 's/^worktree //p' | while IFS= read -r wp; do
        [ "$(canon "$wp")" = "$want" ] && { echo HIT; break; }
      done | grep -q HIT
}

# Build a fresh disposable git repo with one commit and identity configured.
fresh_repo() {
  local d; d="$(mktemp -d "$TMP/repo.XXXXXX")"
  git -C "$d" init -q
  git -C "$d" config user.email "test@example.com"
  git -C "$d" config user.name  "Test User"
  git -C "$d" commit -q --allow-empty -m "init"
  echo "$d"
}

# Invoke pi-worktree.sh create.
# Args: repo_root branch base_ref base_branch work_path diff_out cleanup_out rundir_file
wt_create() {
  local repo_root="$1" branch="$2" base_ref="$3" base_branch="$4" \
        work="$5" diff_out="$6" cleanup_out="$7" rundir_file="$8"
  bash "$WT" create \
    --repo_root    "$repo_root" \
    --branch_name  "$branch" \
    --base_ref     "$base_ref" \
    --base_branch  "$base_branch" \
    --work_path    "$work" \
    --diff_out     "$diff_out" \
    --cleanup_out  "$cleanup_out" \
    --rundir-file  "$rundir_file" \
    >/dev/null 2>&1
}

echo "=== worktree-cleanup-test: behavioral coverage for pi-worktree.sh ==="

# ===========================================================================
# Test (a): confirm-poll reads pgid from frozen rundir-file PATH CONTENTS (EX-C2)
#
# Proof: write a known RUNDIR into the rundir-file, put pi.pgid with a known
# (already-dead) PGID under it, run cleanup under set -x, and assert the
# poll's `kill -0` targets that exact PGID (not an empty or unbound value).
# ===========================================================================
R_A="$(fresh_repo)"
WORK_A="$R_A/work"
RUNDIR_A="$TMP/rundir_a"; mkdir -p "$RUNDIR_A"
RUNFILE_A="$TMP/runfile_a.path"
printf '%s\n' "$RUNDIR_A" > "$RUNFILE_A"

# Use a genuinely dead PID (spawn+wait a subshell, reuse its pid).
( exit 0 ) &
KNOWN_PGID=$!
wait "$KNOWN_PGID" 2>/dev/null || true
printf '%s\n' "$KNOWN_PGID" > "$RUNDIR_A/pi.pgid"

CO_A="$TMP/cleanup_a.sh"
if wt_create "$R_A" "test/branch-a" "$(git -C "$R_A" rev-parse HEAD)" \
     "$(git -C "$R_A" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
     "$WORK_A" "$TMP/diff_a.patch" "$CO_A" "$RUNFILE_A"; then

  # Run under bash -x so we can inspect the trace for kill -0 <pgid>.
  env -i PATH="$PATH" HOME="$HOME" bash -x "$CO_A" \
    >"$TMP/clean_a.out" 2>"$TMP/clean_a.trace" || true

  if grep -Eq "kill -0 .*\b${KNOWN_PGID}\b" "$TMP/clean_a.trace"; then
    ok "(a) confirm-poll kill -0 targets the PGID read from frozen rundir-file contents"
  else
    bad "(a) poll did not kill -0 the file-contents PGID ${KNOWN_PGID} (path not frozen or not read)"
  fi
else
  bad "(a) create failed; cannot trace confirm-poll"
fi

# ===========================================================================
# Test (b): kill-confirm BEFORE remove ordering race (EX-D1) +
#           trace-based: kill -0 appears BEFORE git worktree remove (EX-B-SHARP-MUTANT)
#
# Part 1 (race-based, preserved): A live process group (SIGTERM-ignoring, own
# process group via perl setsid) holds an open handle inside $WORK. While alive:
# cleanup must BLOCK at the confirm-poll and NOT remove (worktree still listed).
# After SIGKILL: cleanup proceeds and remove succeeds (worktree gone).
#
# Part 2 (trace-based, NEW): Run cleanup under bash -x with a dead PGID. The
# generated cleanup must show `kill -0` targeting the file-contents PGID BEFORE
# the `git worktree remove` line in the trace. Against the delete-poll mutant
# (kill -0 loop stripped), no `kill -0` appears -> this assertion FAILS -> the
# FAIL line is labeled (b) -> gate MG-DELETE-POLL satisfied.
#
# Design note (EX-CLR-2): Part-2 (trace: kill -0 before worktree remove) is the
# DISCRIMINATING assertion vs the delete-poll mutant — a stripped confirm-poll
# leaves no kill -0 in the trace, making Part-2 fail immediately.
# Part-1 (live-PGID race) is redundant/secondary vs that mutant: a delete-poll
# build completes fast without blocking on the live process, so the 1-second
# checkpoint may still see the worktree listed by coincidence (false-green vs
# that mutant). Both parts keep running unchanged — intentional design.
# ===========================================================================
R_B="$(fresh_repo)"
WORK_B="$R_B/work"
RUNDIR_B="$TMP/rundir_b"; mkdir -p "$RUNDIR_B"
RUNFILE_B="$TMP/runfile_b.path"
printf '%s\n' "$RUNDIR_B" > "$RUNFILE_B"
CO_B="$TMP/cleanup_b.sh"

if wt_create "$R_B" "test/branch-b" "$(git -C "$R_B" rev-parse HEAD)" \
     "$(git -C "$R_B" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
     "$WORK_B" "$TMP/diff_b.patch" "$CO_B" "$RUNFILE_B"; then

  # ------------------------------------------------------------------
  # Part 1 (race-based): live SIGTERM-ignoring process in its own pgid.
  # ------------------------------------------------------------------
  HOLDER_B="$WORK_B/.test-holder"
  GATE_PGID="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')"

  perl -e '
    use POSIX qw(setsid);
    setsid();
    $SIG{TERM} = "IGNORE";
    open(my $h, ">", $ARGV[0]) or die;
    print $h "held\n"; close $h;
    sleep 30;
    exit 0;
  ' "$HOLDER_B" &
  LEADER_B=$!

  # Wait until leader is in its own process group (setsid runs slightly after fork).
  LEADER_PGID_B=""
  _s=0
  while [ "$_s" -lt 50 ]; do
    LEADER_PGID_B="$(ps -o pgid= -p "$LEADER_B" 2>/dev/null | tr -d ' ')"
    [ -n "$LEADER_PGID_B" ] && [ "$LEADER_PGID_B" != "$GATE_PGID" ] && break
    sleep 0.1; _s=$((_s+1))
  done
  [ -z "$LEADER_PGID_B" ] && LEADER_PGID_B="$LEADER_B"

  if [ -n "$GATE_PGID" ] && [ "$LEADER_PGID_B" = "$GATE_PGID" ]; then
    # Failed to isolate process group — environment limitation.
    kill -KILL "$LEADER_B" 2>/dev/null || true
    bad "(b) holder did not isolate its process group (environment limitation) — skipped"
    bad "(b) kill-confirm-before-remove race (group isolation unavailable)"
  else
    # Write the leader's PGID into pi.pgid (simulates what pi-dispatch.sh writes).
    printf '%s\n' "$LEADER_PGID_B" > "$RUNDIR_B/pi.pgid"

    # Wait until holder file appears (process is live and running).
    _i=0
    while [ ! -f "$HOLDER_B" ] && [ "$_i" -lt 50 ]; do sleep 0.1; _i=$((_i+1)); done

    # Phase 1: run cleanup in the background; checkpoint at t=1s.
    # pi-stop.sh sends SIGTERM then waits 2s then SIGKILL.
    # Our leader ignores SIGTERM, so at t=1s it is still alive.
    # A correct (confirm-before-remove) build has NOT removed yet.
    env -i PATH="$PATH" HOME="$HOME" bash "$CO_B" \
      >"$TMP/clean_b.out" 2>&1 &
    CLEAN_PID_B=$!
    sleep 1

    leader_alive_b=0; kill -0 "$LEADER_B" 2>/dev/null && leader_alive_b=1
    still_listed_b=0; wt_registered "$R_B" "$WORK_B" && still_listed_b=1

    # Phase 2: SIGKILL (uncatchable) ends the leader; cleanup should proceed.
    kill -KILL "$LEADER_B" 2>/dev/null || true
    _j=0
    while kill -0 "$CLEAN_PID_B" 2>/dev/null && [ "$_j" -lt 120 ]; do
      sleep 0.25; _j=$((_j+1))
    done
    kill -0 "$CLEAN_PID_B" 2>/dev/null && { kill -KILL "$CLEAN_PID_B" 2>/dev/null || true; }

    gone_b=1; wt_registered "$R_B" "$WORK_B" && gone_b=0

    if [ "$leader_alive_b" -eq 1 ] && [ "$still_listed_b" -eq 1 ]; then
      ok "(b) live PGID blocks cleanup at confirm-poll; remove NOT executed while alive"
    else
      bad "(b) cleanup removed worktree before confirming death (leader_alive=$leader_alive_b still_listed=$still_listed_b)"
    fi
    if [ "$gone_b" -eq 1 ]; then
      ok "(b) after process dies, cleanup proceeds and remove succeeds"
    else
      bad "(b) worktree not removed after process death"
    fi
  fi

  # ------------------------------------------------------------------
  # Part 2 (trace-based): kill -0 must appear BEFORE git worktree remove
  # in the bash -x trace of a dead-PGID cleanup.
  #
  # We use a separate repo/cleanup so Part 1's state does not interfere.
  # A dead PGID lets the poll resolve immediately (no live wait needed).
  # The trace line ordering is the discriminator:
  #   correct build  -> kill -0 <pgid> line appears before worktree remove
  #   delete-poll mutant -> NO kill -0 line -> assertion FAILS -> (b) FAIL
  # ------------------------------------------------------------------
  R_BT="$(fresh_repo)"
  WORK_BT="$R_BT/work"
  RUNDIR_BT="$TMP/rundir_bt"; mkdir -p "$RUNDIR_BT"
  RUNFILE_BT="$TMP/runfile_bt.path"
  printf '%s\n' "$RUNDIR_BT" > "$RUNFILE_BT"

  ( exit 0 ) &
  DEAD_PGID_BT=$!
  wait "$DEAD_PGID_BT" 2>/dev/null || true
  printf '%s\n' "$DEAD_PGID_BT" > "$RUNDIR_BT/pi.pgid"

  CO_BT="$TMP/cleanup_bt.sh"
  if wt_create "$R_BT" "test/branch-bt" "$(git -C "$R_BT" rev-parse HEAD)" \
       "$(git -C "$R_BT" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
       "$WORK_BT" "$TMP/diff_bt.patch" "$CO_BT" "$RUNFILE_BT"; then

    env -i PATH="$PATH" HOME="$HOME" bash -x "$CO_BT" \
      >"$TMP/clean_bt.out" 2>"$TMP/clean_bt.trace" || true

    # Extract line numbers from the trace for kill -0 and worktree remove.
    # bash -x emits "+ <cmd>" lines in execution order; grep -n gives line positions.
    kill0_line="$(grep -n 'kill -0' "$TMP/clean_bt.trace" 2>/dev/null | head -1 | cut -d: -f1)"
    remove_line="$(grep -n 'worktree remove' "$TMP/clean_bt.trace" 2>/dev/null | head -1 | cut -d: -f1)"

    if [ -z "$kill0_line" ]; then
      bad "(b) trace-based: no kill -0 found in cleanup trace (confirm-poll absent or stripped)"
    elif [ -z "$remove_line" ]; then
      bad "(b) trace-based: no worktree remove found in cleanup trace"
    elif [ "$kill0_line" -lt "$remove_line" ]; then
      ok "(b) trace-based: kill -0 (line $kill0_line) appears before worktree remove (line $remove_line)"
    else
      bad "(b) trace-based: kill -0 (line $kill0_line) does NOT precede worktree remove (line $remove_line)"
    fi
  else
    bad "(b) trace-based: create failed; cannot run trace ordering check"
  fi

else
  bad "(b) create failed; cannot run the ordering race"
  bad "(b) kill-confirm-before-remove race (create failed)"
  bad "(b) trace-based: kill -0 appears before worktree remove (create failed)"
fi

# ===========================================================================
# Test (c): cleanup block has no unbound variable under env -i bash -u (EX-C1c/EX-C3)
#
# Create a new worktree (dead PGID so cleanup resolves immediately), then run
# the cleanup script under `env -i bash -u` with no ambient dispatch vars.
# Must not raise 'unbound variable'.
# ===========================================================================
R_C="$(fresh_repo)"
WORK_C="$R_C/work"
RUNDIR_C="$TMP/rundir_c"; mkdir -p "$RUNDIR_C"
RUNFILE_C="$TMP/runfile_c.path"
printf '%s\n' "$RUNDIR_C" > "$RUNFILE_C"

# Dead PGID so the confirm-poll exits immediately.
( exit 0 ) &
DEAD_PGID_C=$!
wait "$DEAD_PGID_C" 2>/dev/null || true
printf '%s\n' "$DEAD_PGID_C" > "$RUNDIR_C/pi.pgid"

CO_C="$TMP/cleanup_c.sh"
if wt_create "$R_C" "test/branch-c" "$(git -C "$R_C" rev-parse HEAD)" \
     "$(git -C "$R_C" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
     "$WORK_C" "$TMP/diff_c.patch" "$CO_C" "$RUNFILE_C"; then

  # Also verify the literal rundir-file path is frozen into the cleanup script.
  if ! grep -Fq "$RUNFILE_C" "$CO_C"; then
    bad "(c) cleanup_out does not contain the literal rundir-file path (not frozen)"
  else
    ok "(c) cleanup_out contains the literal frozen rundir-file path"
  fi

  # Verify no bare session-scoped variable.
  if grep -Eq '\$\{?(session|rundir|SESSION)\b' "$CO_C"; then
    bad "(c) cleanup_out contains a bare session-scoped variable (\$session/\$rundir/\$SESSION)"
  else
    ok "(c) no bare session-scoped variable in cleanup_out"
  fi

  # Run under env -i bash -u: must not raise 'unbound variable'.
  env -i PATH="$PATH" HOME="$HOME" bash -u "$CO_C" \
    >"$TMP/clean_c.out" 2>&1 || true
  if grep -q 'unbound variable' "$TMP/clean_c.out"; then
    bad "(c) env -i bash -u raised 'unbound variable' in cleanup script"
  else
    ok "(c) env -i bash -u cleanup: no unbound variable"
  fi
else
  bad "(c) create failed; cannot run unbound-variable check"
  bad "(c) literal path freeze check (create failed)"
  bad "(c) bare session-var check (create failed)"
fi

# ===========================================================================
# Test (d): injection guard for all 6 bakeable params (EX-D-MATRIX + EX-D-NEWLINE)
#
# For each bakeable parameter, set it to a breakout payload and run create+clean.
# Assert the SENTINEL file is absent BOTH after create and after clean.
#
# Bakeable params (frozen as create-time literals via printf %q):
#   work_path, diff_out, rundir-file, repo_root, base_ref, base_branch
#
# The newline vector (EX-D-NEWLINE): work_path set to a value with an embedded
# newline that, if un-escaped, would break out of the comment line in the
# generated cleanup and execute `touch SENTINEL`. This is the exact vector the
# gate's injection mutant (stripping printf %q on work_path) exploits.
#
# Correct build: printf %q escapes all values -> SENTINEL never created.
# Un-escaped mutant: newline lands in comment -> extra line executed -> SENTINEL exists.
# ===========================================================================

echo "--- (d) injection guard matrix ---"

# Dead pgid for all (d) tests so cleanup can run fully.
( exit 0 ) &
DEAD_PGID_D=$!
wait "$DEAD_PGID_D" 2>/dev/null || true

# Helper: run one param injection test.
# $1=param_name $2=value_for_param $3=sentinel_abs_path $4=use_as_work (1=work_path,0=normal)
# When work_path has payload: repo's base work_path needs to differ (payload IS the work_path).
# For params other than work_path: use a safe work_path.
_d_test() {
  local pname="$1" payload="$2" sentinel="$3"
  local R_D; R_D="$(fresh_repo)"
  local D_D; D_D="$(mktemp -d "$TMP/d_${pname}.XXXXXX")"
  local RUNDIR_D="$D_D/rundir"; mkdir -p "$RUNDIR_D"
  printf '%s\n' "$DEAD_PGID_D" > "$RUNDIR_D/pi.pgid"
  local RUNFILE_D="$D_D/runfile.path"
  printf '%s\n' "$RUNDIR_D" > "$RUNFILE_D"
  local CO_D="$D_D/cleanup.sh"
  local SAFE_WORK="$R_D/work"
  local SAFE_DIFF="$D_D/diff.patch"
  local SAFE_RUNFILE="$RUNFILE_D"
  local SAFE_REPO="$R_D"
  local HEAD_D; HEAD_D="$(git -C "$R_D" rev-parse HEAD)"
  local BRANCH_D; BRANCH_D="$(git -C "$R_D" symbolic-ref --short HEAD 2>/dev/null || echo master)"
  local CREATE_OK=0

  rm -f "$sentinel"

  case "$pname" in
    work_path)
      # payload IS the work_path — create will likely fail (path with newline is invalid on most FS)
      # or succeed on the repo but generate an escaped form. Either way SENTINEL must be absent.
      ( cd "$D_D" && bash "$WT" create \
          --repo_root    "$SAFE_REPO" \
          --branch_name  "d/work-payload" \
          --base_ref     "$HEAD_D" \
          --base_branch  "$BRANCH_D" \
          --work_path    "$payload" \
          --diff_out     "$SAFE_DIFF" \
          --cleanup_out  "$CO_D" \
          --rundir-file  "$SAFE_RUNFILE" \
          >/dev/null 2>&1 ) && CREATE_OK=1
      ;;
    diff_out)
      ( cd "$D_D" && bash "$WT" create \
          --repo_root    "$SAFE_REPO" \
          --branch_name  "d/diff-payload" \
          --base_ref     "$HEAD_D" \
          --base_branch  "$BRANCH_D" \
          --work_path    "$SAFE_WORK" \
          --diff_out     "$payload" \
          --cleanup_out  "$CO_D" \
          --rundir-file  "$SAFE_RUNFILE" \
          >/dev/null 2>&1 ) && CREATE_OK=1
      ;;
    rundir_file)
      # payload is the rundir-file path: provide a structurally valid file with the payload name
      # The content still points to RUNDIR_D so pgid resolves.
      # But if the filename has injection chars the generated cleanup may misbehave.
      ( cd "$D_D" && bash "$WT" create \
          --repo_root    "$SAFE_REPO" \
          --branch_name  "d/rf-payload" \
          --base_ref     "$HEAD_D" \
          --base_branch  "$BRANCH_D" \
          --work_path    "$SAFE_WORK" \
          --diff_out     "$SAFE_DIFF" \
          --cleanup_out  "$CO_D" \
          --rundir-file  "$payload" \
          >/dev/null 2>&1 ) && CREATE_OK=1
      ;;
    repo_root)
      # repo_root with payload: create will reject (not a git repo) -> exit 1, no cleanup generated
      # That IS the safe behavior (injection can't escape if create fails).
      ( cd "$D_D" && bash "$WT" create \
          --repo_root    "$payload" \
          --branch_name  "d/repo-payload" \
          --base_ref     "$HEAD_D" \
          --base_branch  "$BRANCH_D" \
          --work_path    "$SAFE_WORK" \
          --diff_out     "$SAFE_DIFF" \
          --cleanup_out  "$CO_D" \
          --rundir-file  "$SAFE_RUNFILE" \
          >/dev/null 2>&1 ) && CREATE_OK=1
      ;;
    base_ref)
      ( cd "$D_D" && bash "$WT" create \
          --repo_root    "$SAFE_REPO" \
          --branch_name  "d/ref-payload" \
          --base_ref     "$payload" \
          --base_branch  "$BRANCH_D" \
          --work_path    "$SAFE_WORK" \
          --diff_out     "$SAFE_DIFF" \
          --cleanup_out  "$CO_D" \
          --rundir-file  "$SAFE_RUNFILE" \
          >/dev/null 2>&1 ) && CREATE_OK=1
      ;;
    base_branch)
      ( cd "$D_D" && bash "$WT" create \
          --repo_root    "$SAFE_REPO" \
          --branch_name  "d/bb-payload" \
          --base_ref     "$HEAD_D" \
          --base_branch  "$payload" \
          --work_path    "$SAFE_WORK" \
          --diff_out     "$SAFE_DIFF" \
          --cleanup_out  "$CO_D" \
          --rundir-file  "$SAFE_RUNFILE" \
          >/dev/null 2>&1 ) && CREATE_OK=1
      ;;
  esac

  # Check SENTINEL after create.
  if [ -e "$sentinel" ]; then
    bad "(d) $pname: SENTINEL created during create (injection breakout at create stage)"
    rm -f "$sentinel"
    return
  fi

  # Run cleanup if it was generated (some params cause create to exit 1 = safe by itself).
  if [ "$CREATE_OK" -eq 1 ] && [ -f "$CO_D" ]; then
    ( cd "$D_D" && bash "$CO_D" >/dev/null 2>&1 ) || true
    if [ -e "$sentinel" ]; then
      bad "(d) $pname: SENTINEL created during cleanup (injection breakout at clean stage)"
      rm -f "$sentinel"
      return
    fi
  fi

  ok "(d) $pname: no injection breakout (SENTINEL absent after create and after clean)"
}

# EX-D-NL-WORK: work_path newline breakout (gate's canonical injection vector).
# Payload: 'wp\ntouch SENTINEL\n#'  — if un-escaped, newline breaks out of comment line,
# `touch SENTINEL` runs as a command, then `#` comments the rest.
S_WORK_NL="$(mktemp -u "$TMP/sent_work.XXXXXX")"
PAYLOAD_WORK_NL="$(printf 'x\ntouch %s\n#' "$S_WORK_NL")"
_d_test "work_path" "$PAYLOAD_WORK_NL" "$S_WORK_NL"

# EX-D-NL-DIFF: diff_out newline breakout (per-param, self-discriminating).
# Payload: 'x\ntouch SENTINEL\n#'  — if _q_diff_out un-escaped, breakout fires in cleanup.
S_DIFF_NL="$(mktemp -u "$TMP/sent_diff.XXXXXX")"
PAYLOAD_DIFF_NL="$(printf 'x\ntouch %s\n#' "$S_DIFF_NL")"
_d_test "diff_out" "$PAYLOAD_DIFF_NL" "$S_DIFF_NL"

# EX-D-NL-RUNDIR: rundir_file newline breakout (per-param, self-discriminating).
# Payload: 'x\ntouch SENTINEL\n#'  — if _q_rundir_file un-escaped, breakout fires in cleanup.
S_RF_NL="$(mktemp -u "$TMP/sent_rf.XXXXXX")"
PAYLOAD_RF_NL="$(printf 'x\ntouch %s\n#' "$S_RF_NL")"
_d_test "rundir_file" "$PAYLOAD_RF_NL" "$S_RF_NL"

# EX-D-REPO-REJECT: repo_root recorded-rejection assertion.
# repo_root set to a newline payload (non-git path) — create must reject with nonzero
# exit AND produce no cleanup script. This assertion depends on the rev-parse --git-dir
# guard and flips RED when that guard is removed (gate MG-REPO-REJECT).
S_REPO_NL="$(mktemp -u "$TMP/sent_repo.XXXXXX")"
PAYLOAD_REPO_NL="$(printf 'x\ntouch %s\n#' "$S_REPO_NL")"
D_REPO_NL="$(mktemp -d "$TMP/d_repo_rej.XXXXXX")"
CO_REPO_NL="$D_REPO_NL/cleanup.sh"
RD_REPO_NL="$D_REPO_NL/rundir"; mkdir -p "$RD_REPO_NL"
RF_REPO_NL="$D_REPO_NL/runfile.path"
printf '%s\n' "$RD_REPO_NL" > "$RF_REPO_NL"
printf '%s\n' "$DEAD_PGID_D" > "$RD_REPO_NL/pi.pgid"
R_REPO_NL="$(fresh_repo)"
rm -f "$CO_REPO_NL" "$S_REPO_NL"
( cd "$D_REPO_NL" && bash "$WT" create \
    --repo_root    "$PAYLOAD_REPO_NL" \
    --branch_name  "d/repo-rej-test" \
    --base_ref     "$(git -C "$R_REPO_NL" rev-parse HEAD)" \
    --base_branch  "$(git -C "$R_REPO_NL" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
    --work_path    "$R_REPO_NL/work" \
    --diff_out     "$D_REPO_NL/diff.patch" \
    --cleanup_out  "$CO_REPO_NL" \
    --rundir-file  "$RF_REPO_NL" \
    >/dev/null 2>&1 ); repo_rej_rc=$?
if [ "$repo_rej_rc" -ne 0 ] && [ ! -s "$CO_REPO_NL" ] && [ ! -e "$S_REPO_NL" ]; then
  ok "(d) repo_root: create rejected non-git repo_root (exit nonzero, no cleanup emitted)"
else
  bad "(d) repo_root: create did NOT reject non-git repo_root (rc=$repo_rej_rc cleanup_exists=$([ -s "$CO_REPO_NL" ] && echo yes || echo no))"
fi

# EX-D-NL-REF: base_ref newline breakout (per-param, self-discriminating).
# Payload: 'x\ntouch SENTINEL\n#'  — if _q_diff_base_fallback un-escaped, breakout fires.
S_REF_NL="$(mktemp -u "$TMP/sent_ref.XXXXXX")"
PAYLOAD_REF_NL="$(printf 'x\ntouch %s\n#' "$S_REF_NL")"
_d_test "base_ref" "$PAYLOAD_REF_NL" "$S_REF_NL"

# EX-D-NL-BB: base_branch newline breakout (per-param, self-discriminating).
# Payload: 'x\ntouch SENTINEL\n#'  — if _q_diff_base_branch un-escaped, breakout fires.
S_BB_NL="$(mktemp -u "$TMP/sent_bb.XXXXXX")"
PAYLOAD_BB_NL="$(printf 'x\ntouch %s\n#' "$S_BB_NL")"
_d_test "base_branch" "$PAYLOAD_BB_NL" "$S_BB_NL"

# ===========================================================================
# Test (d-benign): anti-overcorrection — metachar path preserved as literal (EX-D-BENIGN)
#
# diff_out set to a benign path with spaces + literal $() + parens.
# After create+clean: the diff file EXISTS at that EXACT literal path (zero-byte
# is fine — cleanup runs git diff which may produce empty output), no mangled
# siblings, worktree removed.
#
# Design note (EX-CLR-1): (d-benign) drives diff_out as its metachar param and
# shares the SAME _q_diff_out escape path as the (d) diff_out line above. If
# _q_diff_out were un-escaped, BOTH (d) diff_out AND (d-benign) would turn RED —
# one root cause, a cascade, not three independent failures. The (d) diff_out
# _d_test call above retains its own labeled sentinel assertion (S_DIFF_NL) and
# is separately discriminating; the cascade is an additional consequence, not a
# replacement.
# ===========================================================================
echo "--- (d-benign) anti-overcorrection ---"

R_DB="$(fresh_repo)"
D_DB="$(mktemp -d "$TMP/d_benign.XXXXXX")"
RUNDIR_DB="$D_DB/rundir"; mkdir -p "$RUNDIR_DB"
RUNFILE_DB="$D_DB/runfile.path"
printf '%s\n' "$RUNDIR_DB" > "$RUNFILE_DB"

( exit 0 ) &
DEAD_PGID_DB=$!
wait "$DEAD_PGID_DB" 2>/dev/null || true
printf '%s\n' "$DEAD_PGID_DB" > "$RUNDIR_DB/pi.pgid"

# Benign path: space + literal $() + parens — must survive printf %q round-trip.
BENIGN_DIFF="$D_DB/di ff\$(echo nope) (x).patch"
CO_DB="$D_DB/cleanup.sh"
WORK_DB="$R_DB/work"

if ( cd "$D_DB" && bash "$WT" create \
       --repo_root    "$R_DB" \
       --branch_name  "d/benign-test" \
       --base_ref     "$(git -C "$R_DB" rev-parse HEAD)" \
       --base_branch  "$(git -C "$R_DB" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
       --work_path    "$WORK_DB" \
       --diff_out     "$BENIGN_DIFF" \
       --cleanup_out  "$CO_DB" \
       --rundir-file  "$RUNFILE_DB" \
       >/dev/null 2>&1 ); then

  ( cd "$D_DB" && bash "$CO_DB" >/dev/null 2>&1 ) || true

  # The diff file must exist at the EXACT literal path (zero-byte is fine).
  if [ -e "$BENIGN_DIFF" ]; then
    ok "(d-benign) diff file exists at exact literal path with spaces/metachar"
  else
    bad "(d-benign) diff file missing at literal path '$BENIGN_DIFF' (path mangled or not written)"
  fi

  # No mangled siblings: $D_DB/di and $D_DB/nope.patch must NOT exist.
  mangled=0
  [ -e "$D_DB/di" ] && mangled=1
  [ -e "$D_DB/nope.patch" ] && mangled=1
  [ -e "$D_DB/di ff" ] && mangled=1
  if [ "$mangled" -eq 0 ]; then
    ok "(d-benign) no mangled sibling files (metachar not word-split)"
  else
    bad "(d-benign) mangled sibling file(s) present (path was word-split or over-escaped)"
  fi

  # Worktree must be removed.
  if wt_registered "$R_DB" "$WORK_DB"; then
    bad "(d-benign) worktree still registered after cleanup (remove not executed)"
  else
    ok "(d-benign) worktree removed after cleanup"
  fi
else
  bad "(d-benign) create failed; cannot verify metachar path preservation"
  bad "(d-benign) mangled sibling check (create failed)"
  bad "(d-benign) worktree removed check (create failed)"
fi

# ===========================================================================
# Test (d) branch_name: cleanup-heredoc exclusion verified (EX-CLR-3)
#
# branch_name (the 8th create param) is intentionally absent from the (d)
# injection matrix above. It is never baked into the cleanup heredoc: it is
# consumed only at create time by `git worktree add -B "$branch_name"` (see
# pi-worktree.sh:124) and never written into the generated cleanup script.
# The create-time literals frozen into the cleanup are work_path, diff_out,
# rundir_file, repo_root, base_ref, base_branch — branch_name is not among
# them, so no printf %q escaping is needed for it in the cleanup context.
#
# Behavioral assertion: pass a newline-bearing branch_name payload at create
# time; grep the GENERATED cleanup script ($CO) for the payload; run it; assert
# SENTINEL absent. Reads a real generated artifact — capable of failing if
# branch_name ever enters the cleanup heredoc.
# ===========================================================================
echo "--- (d) branch_name exclusion assertion ---"

R_BN="$(fresh_repo)"
D_BN="$(mktemp -d "$TMP/d_bn.XXXXXX")"
RUNDIR_BN="$D_BN/rundir"; mkdir -p "$RUNDIR_BN"
RUNFILE_BN="$D_BN/runfile.path"
printf '%s\n' "$RUNDIR_BN" > "$RUNFILE_BN"

# Dead PGID so cleanup can run fully.
( exit 0 ) &
DEAD_PGID_BN=$!
wait "$DEAD_PGID_BN" 2>/dev/null || true
printf '%s\n' "$DEAD_PGID_BN" > "$RUNDIR_BN/pi.pgid"

# Newline-bearing payload: if branch_name were ever baked into the heredoc,
# the newline would break out of any comment line and run `touch SENTINEL`.
S_BN="$(mktemp "$TMP/sent_bn.XXXXXX")"
rm -f "$S_BN"
PAYLOAD_BN="$(printf 'x\ntouch %s\n#' "$S_BN")"
CO_BN="$D_BN/cleanup.sh"

( cd "$D_BN" && bash "$WT" create \
    --repo_root    "$R_BN" \
    --branch_name  "$PAYLOAD_BN" \
    --base_ref     "$(git -C "$R_BN" rev-parse HEAD)" \
    --base_branch  "$(git -C "$R_BN" symbolic-ref --short HEAD 2>/dev/null || echo master)" \
    --work_path    "$R_BN/work" \
    --diff_out     "$D_BN/diff.patch" \
    --cleanup_out  "$CO_BN" \
    --rundir-file  "$RUNFILE_BN" \
    >/dev/null 2>&1 ) || true

# Run the cleanup if it was generated.
[ -f "$CO_BN" ] && ( cd "$D_BN" && bash "$CO_BN" >/dev/null 2>&1 ) || true

# Assert: payload not in generated cleanup AND SENTINEL not created.
bn_payload_in_cleanup=0
[ -f "$CO_BN" ] && grep -Fq "touch $S_BN" "$CO_BN" && bn_payload_in_cleanup=1
bn_sentinel_created=0
[ -e "$S_BN" ] && bn_sentinel_created=1

if [ "$bn_payload_in_cleanup" -eq 0 ] && [ "$bn_sentinel_created" -eq 0 ]; then
  ok "(d) branch_name: payload absent from generated cleanup + no SENTINEL (not a cleanup-injection surface)"
else
  bad "(d) branch_name: payload leaked into generated cleanup (in_cleanup=$bn_payload_in_cleanup) OR SENTINEL created (sentinel=$bn_sentinel_created) — branch_name baked into heredoc"
fi

echo "---"
echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
