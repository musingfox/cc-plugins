#!/usr/bin/env bash
# Phase-3 lifecycle for ONE shard, end-to-end, in pure shell. Two builders share it:
# the plain form dispatches OMP; --prepare-only / --gates-only bracket a Claude
# builder (cf:implement) that main dispatches between the two calls.
# Main launches this as a background task (run_in_background) and only reads the
# resulting OUTCOME_FILE -- it never sees brief/report/JSONL/test logs directly
# (the background task's stdout is captured to its own output file, not main's
# context). Runs to completion synchronously here, so it is exempt from the
# foreground Bash ceiling.
#
# Usage:   cf-pi-run.sh [--prepare-only|--gates-only] SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER
#   (plain)         steps 0-13: prepare, probe, dispatch OMP, poll, gates
#   --prepare-only  steps 0-2 only: ready the worktree and brief for a Claude
#                   builder, never probe or dispatch. Run with cwd inside the
#                   host repo. Last stdout line: PREPARED <brief path>, exit 0,
#                   no outcome.md.
#   --gates-only    steps 6-13 only, after the Claude builder returned: the same
#                   gates the OMP path runs, ending in the same outcome.md.
#                   Removes only a stale outcome.md and implement.diff. A missing
#                   report or a suite red twice hands back one re-brief per round
#                   (REBRIEF <kind> <path> as the last stdout line, exit 3, no
#                   outcome.md); `rebriefs` records which were already issued.
# Stdout:  operator-facing progress lines (one per major event)
# Writes:  $BRIEF_FILE, $REPORT_FILE (builder), $ESCALATE_FILE (builder optional),
#          $DIFF_FILE, $OUTCOME_FILE (this script -- structured outcome)
# Exit:    0 = PASS (or PREPARED), 1 = FAIL, 2 = NEEDS_REPLAN, 3 = REBRIEF
#          (--gates-only only)
#
# Lifecycle (in order):
#   0. clear run artifacts   (plain and --prepare-only; --gates-only removes only a
#                            stale outcome/diff) last round's files must not
#                            be read as this round's (a re-launched shard reuses
#                            the same session directory)
#   1-2. cf-pi-prepare.sh    worktree + branch, prerequisite checkpoints merged,
#                            brief assembled (plain and --prepare-only)
#   3. cf-pi-probe.sh        liveness probe            (plain only)
#   4. cf-pi-dispatch.sh     background OMP            (plain only)
#   5. poll loop             cf-pi-poll.sh once per ~30s, max 64 rounds at the default wall clock
#                            (plain only)
#   6-13 run in the plain form and in --gates-only.
#   6. escalation detect     $ESCALATE_FILE present => NEEDS_REPLAN
#   7. gate 1 report         head -20 contains ## Summary && ## Completed;
#                            one report-only re-dispatch before failing
#   8. survivors set         contracts this shard both declared and reported done
#   9. gate 3 test execute   cf-pi-test.sh; one in-shard re-dispatch on fail
#  10. actual ⊆ declared     files this shard's own commits touched (prerequisite
#                            checkpoints excluded) ⊆ shard's declared files
#  11. capture diff          git diff $BASE_HEAD > $DIFF_FILE
#  12. completeness         survivors == declared
#  13. revert gate          cf-pi-revert-gate.sh: each contract's tests go red with
#                            the shard's own implementation reverted
#      write OUTCOME_FILE    structured paths-only result main reads back

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

USAGE="Usage: cf-pi-run.sh [--prepare-only|--gates-only] SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER"
MODE=full
BUILDER=omp
case "${1:-}" in
  --prepare-only) MODE=prepare; BUILDER=claude; shift ;;
  --gates-only)   MODE=gates;   BUILDER=claude; shift ;;
  --*) echo "$USAGE" >&2; exit 1 ;;
esac

if [ $# -ne 4 ]; then
  echo "$USAGE" >&2
  exit 1
fi

SHARD_SESSION="$1"
GOAL="$2"
CONSTRAINTS="$3"
TEST_RUNNER="$4"

load_cf_pi_env "$SHARD_SESSION"
if [ -z "${FLOW_SESSION:-}" ] || [ -z "${SHARD_ID:-}" ]; then
  echo "cf-pi-run: $SHARD_SESSION/env.sh missing FLOW_SESSION or SHARD_ID -- not a sharded session" >&2
  exit 1
fi
load_cf_flow_env "$FLOW_SESSION"

START_TS=$(date +%s)

# -------- 0. clear this round's artifacts -------------------------------
# A re-launched shard (cf.md §3.5) reuses its session directory, and nothing
# else truncates these. Left behind, last round's copies are read as this
# round's: outcome.md makes cf-pi-watch.sh report the shard finished before it
# started (with the stale status), escalate.md short-circuits step 6 into
# NEEDS_REPLAN, and implement-report.md carries gate 1 on stale contract claims.
# The worktree/branch is NOT touched -- committed work is the resume base.
# Must stay out of dispatch_and_poll: the gate-3 and gate-1 re-briefs depend on
# the worker rewriting these files, not on finding them emptied.
# prereq-merged goes too (same rationale as prereq-refs in cf-pi-prepare.sh): it is rewritten
# only when depends_on is non-empty, so a replan that drops depends_on would
# otherwise leave last round's "these files are read-only context" block in the
# brief, steering the worker off files this shard now owns.
# pi-rundir goes too: only an in-run resume reads it (this round's first dispatch
# is always fresh), while write_outcome/derive_cause read it on ANY failure --
# including one before dispatch, which would otherwise report the previous
# round's session JSONL and errorMessage as this round's cause.
if [ "$MODE" = gates ]; then
  rm -f "$OUTCOME_FILE" "$DIFF_FILE" 2>/dev/null || true
else
  rm -f "$OUTCOME_FILE" "$REPORT_FILE" "$ESCALATE_FILE" "$DIFF_FILE" "$TEST_LOG" \
        "$SHARD_SESSION/prereq-merged" "$SHARD_SESSION/rebriefs" \
        "$SHARD_SESSION/pi-rundir" "$SHARD_SESSION/pi-rundir-prev" \
        "$SHARD_SESSION/escalate-snippet.md" "$SHARD_SESSION/postmortem.log" \
        "$SHARD_SESSION/gate3.out" "$SHARD_SESSION/gate3-retest.out" \
        "$SHARD_SESSION/gate3-retry.out" "$SHARD_SESSION/dispatch.stderr" 2>/dev/null || true
fi

# -------- helpers --------------------------------------------------------

# Format elapsed seconds since START_TS.
elapsed_s() {
  local now; now=$(date +%s)
  echo "$((now - START_TS))s"
}

# Progress line: task stdout AND $SHARD_SESSION/progress (single line,
# overwritten each call — read by cf-pi-status.sh for phase visibility).
say() {
  echo "[shard $SHARD_ID] $*"
  printf '%s %s\n' "$(date +%H:%M:%S)" "$*" > "$SHARD_SESSION/progress" 2>/dev/null || true
}

# Newest worker session JSONL for this round. A resume re-dispatch gets a fresh
# run dir whose sessions/ stays empty (pi keeps writing into the prior one), so
# the previous dir -- recorded by dispatch_and_poll before it is overwritten --
# must stay in the search or a post-resume failure reports no evidence at all.
newest_jsonl() {
  local f d globs=""
  # Only OMP writes worker JSONL. A Claude shard that follows an OMP round (builder
  # switched mid-flow) would otherwise quote that round's pi-sessions/ errorMessage.
  [ "$BUILDER" = claude ] && return 0
  for f in "$SHARD_SESSION/pi-rundir" "$SHARD_SESSION/pi-rundir-prev"; do
    [ -f "$f" ] || continue
    d="$(cat "$f" 2>/dev/null || true)"
    [ -n "$d" ] && globs="$globs $d/sessions/*.jsonl"
  done
  # shellcheck disable=SC2086
  ls -t $globs "$PI_SESSION_DIR"/*.jsonl 2>/dev/null | head -1 || true
}

# One-line human-readable failure cause for outcome.md, picked from the
# artifact that matches the failure reason (a plausible-but-wrong cause is
# worse than none). Empty on PASS / no evidence.
derive_cause() {
  local status="$1" reason="$2" cause=""
  [ "$status" = "PASS" ] && return 0
  case "$reason" in
    escalate)
      cause=$(sed -n '/^## Blocker/{n;p;q;}' "$ESCALATE_FILE" 2>/dev/null) ;;
    test-fail*|"test runner error")
      [ -s "$TEST_LOG" ] && \
        cause=$(grep -E 'FAILED|failed|Error|not ok|✗' "$TEST_LOG" 2>/dev/null | head -1) ;;
    test-stalled)
      # The suite never returned, so there is no failure line to quote — the last
      # thing it printed is the only evidence of where it stopped.
      [ -s "$TEST_LOG" ] && cause="last output before the deadline: $(tail -1 "$TEST_LOG" 2>/dev/null)" ;;
    undeclared_file_touched)
      cause="scope violation — see undeclared_files below" ;;
    tests-green-on-revert)
      cause="tests stay green with the implementation reverted: $(sed -n 's/^STAYS_GREEN //p' "$SHARD_SESSION/revert-gate.out" 2>/dev/null | head -1)" ;;
    revert-gate-error)
      cause=$(grep -m1 '^ERROR ' "$SHARD_SESSION/revert-gate.out" 2>/dev/null) || true
      [ -n "$cause" ] || cause="cf-pi-revert-gate exited ${GATE_RC:-?} without a verdict" ;;
    QUOTA|QUOTA-WINDOW)
      # A sibling stopped by the wall has no error of its own: name who hit it.
      # The shard that hit it keeps its own errorMessage.
      local wall_tag wall_shard
      wall_tag=$(sed -n 's/^TAG=//p' "$FLOW_SESSION/quota-wall" 2>/dev/null || true)
      wall_shard=$(sed -n 's/^SHARD=//p' "$FLOW_SESSION/quota-wall" 2>/dev/null || true)
      if [ "$wall_tag" = "$reason" ] && [ -n "$wall_shard" ] && [ "$wall_shard" != "$SHARD_ID" ]; then
        cause="$reason wall hit by shard $wall_shard"
      else
        local _j; _j=$(newest_jsonl)
        [ -n "$_j" ] && cause=$(grep -m1 -o '"errorMessage":"[^"]*"' "$_j" 2>/dev/null) || true
      fi ;;
    test-runner-missing)
      cause="the shard test runner is blank — record SHARD_TEST_RUNNER in $FLOW_SESSION/env.sh and pass it as the 4th argument" ;;
    dispatch-refused)
      # pi-dispatch.sh prefixes its refusals; anything else is a wrapper's own
      # complaint, whose last line is the one that says why it gave up. Its
      # warnings can print before the refusal, so one is the cause only when
      # no other pi-dispatch line exists.
      cause=$(awk '/^pi-dispatch: warning:/ { if (w == "") w = $0; next }
                   /^pi-dispatch:/ { print; found = 1; exit }
                   END { if (!found && w != "") print w }' \
                "$SHARD_SESSION/dispatch.stderr" 2>/dev/null) || true
      [ -n "$cause" ] || \
        cause=$(grep -v '^[[:space:]]*$' "$SHARD_SESSION/dispatch.stderr" 2>/dev/null | tail -1) || true
      [ -n "$cause" ] || cause="cf-pi-dispatch exited ${DISPATCH_RC:-?}" ;;
    *)
      # infra failures (stall/timeout/rc-fail/error/...): worker-side error stream
      local _j; _j=$(newest_jsonl)
      [ -n "$_j" ] && cause=$(grep -m1 -o '"errorMessage":"[^"]*"' "$_j" 2>/dev/null) ;;
  esac
  printf '%s' "$cause" | head -c 300
}

# Write OUTCOME_FILE. Args:
#   $1 status (PASS|FAIL|NEEDS_REPLAN)
#   $2 reason (enum string)
#   $3 survived contracts (newline-sep, may be empty)
#   $4 affected contracts (newline-sep "Name: reason", may be empty)
#   $5 postmortem path (or "-")
#   $6 undeclared files (comma-sep, or "-")
write_outcome() {
  local status="$1" reason="$2" survived="$3" affected="$4" pm="$5" undecl="$6"
  local jsonl_path="-"
  local newest; newest=$(newest_jsonl)
  [ -n "$newest" ] && jsonl_path="$newest"

  local esc_path="-"
  [ -s "$ESCALATE_FILE" ] && esc_path="$ESCALATE_FILE"

  local report_path="-"
  [ -s "$REPORT_FILE" ] && report_path="$REPORT_FILE"

  local diff_path="-"
  [ -s "$DIFF_FILE" ] && diff_path="$DIFF_FILE"

  local test_log_path="-"
  [ -s "$TEST_LOG" ] && test_log_path="$TEST_LOG"

  # What the runner said it ran. `unparsed` means the gate could not find a
  # count in the output, so a green exit code is the ONLY evidence here — say
  # that rather than let silence read as a full suite.
  local test_counts="${TEST_COUNTS:-not-run}"

  local cause; cause=$(derive_cause "$status" "$reason")

  {
    printf '## Status\n%s\n\n' "$status"
    printf '## Reason\n%s\n\n' "$reason"
    printf '## Cause\n%s\n\n' "${cause:--}"
    printf '## Tests\n%s\n\n' "$test_counts"
    printf '## Run\n'
    printf -- '- shard: %s\n' "$SHARD_ID"
    printf -- '- builder: %s\n' "$BUILDER"
    printf -- '- elapsed: %s\n' "$(elapsed_s)"
    printf -- '- report: %s\n' "$report_path"
    printf -- '- diff: %s\n' "$diff_path"
    printf -- '- session_jsonl: %s\n' "$jsonl_path"
    printf -- '- escalate: %s\n\n' "$esc_path"

    printf '## Survived contracts\n'
    if [ -z "$survived" ]; then
      printf -- '- (none)\n'
    else
      printf '%s\n' "$survived" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        printf -- '- %s\n' "$line"
      done
    fi
    printf '\n'

    printf '## Affected contracts\n'
    if [ -z "$affected" ]; then
      printf -- '- (none)\n'
    else
      printf '%s\n' "$affected" | while IFS= read -r line; do
        [ -z "$line" ] && continue
        printf -- '- %s\n' "$line"
      done
    fi
    printf '\n'

    printf '## Artifacts\n'
    printf -- '- postmortem: %s\n' "$pm"
    printf -- '- test_log: %s\n' "$test_log_path"
    printf -- '- undeclared_files: %s\n' "$undecl"
  } > "$OUTCOME_FILE"

  # --- persistent run index (survives the /tmp session purge) -------------
  # The cf working session lives under /tmp (it carries a git worktree) and is
  # purged on reboot, taking its postmortem/stderr/outcome with it. Mirror a
  # durable record into $PI_RUNS_DIR so a failed shard stays diagnosable: one
  # index line per outcome (shared with pi-dispatch/spiral via the `label`
  # column), plus, on any non-PASS, a copy of the outcome + postmortem bundle.
  # All best-effort (|| true): observability must never fail the run.
  local runs_dir="${PI_RUNS_DIR:-$HOME/.cache/pi-runs}"
  mkdir -p "$runs_dir" 2>/dev/null || true
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date +%Y-%m-%dT%H:%M:%S%z)" "context-flow" "$status" "$reason" \
    "$(elapsed_s)" "$SHARD_SESSION" \
    >> "$runs_dir/index.log" 2>/dev/null || true
  if [ "$status" != "PASS" ]; then
    local bundle="$runs_dir/context-flow/$(basename "$SHARD_SESSION")__${SHARD_ID}"
    mkdir -p "$bundle" 2>/dev/null || true
    cp "$OUTCOME_FILE" "$bundle/outcome.md" 2>/dev/null || true
    [ -f "$SHARD_SESSION/postmortem.log" ] && \
      cp "$SHARD_SESSION/postmortem.log" "$bundle/postmortem.log" 2>/dev/null || true
  fi
}

# Names of contracts declared in this shard (newline-sep).
shard_contract_names() {
  jq -r --arg sid "$SHARD_ID" '.groups[$sid].contracts[]' "$SHARDS_FILE"
}

# Extract Completed-claimed contract names from $REPORT_FILE.
# OMP protocol uses "_(contract: Name)_" suffix on each Completed bullet.
completed_contracts() {
  # Pull only the lines inside ## Completed section.
  sed -n '/^## Completed/,/^## /p' "$REPORT_FILE" \
    | grep -oE '_\(contract: [^)]+\)_' \
    | sed -E 's/^_\(contract: (.+)\)_$/\1/' \
    | awk '!seen[$0]++'
}

# Run cf-pi-postmortem.sh and stash output as a file path. Returns the path.
do_postmortem() {
  local out="$SHARD_SESSION/postmortem.log"
  "$SCRIPTS/cf-pi-postmortem.sh" "$SHARD_SESSION" > "$out" 2>&1 || true
  echo "$out"
}

# The batch's quota wall: $FLOW_SESSION/quota-wall, lines TAG=, SHARD=, EPOCH=.
# Only a wall recorded since this run started counts, so an old wall never
# stops a later re-run and nothing has to clean the file up.
# Sets WALL_TAG and WALL_SHARD; returns 0 when the wall counts.
quota_wall_valid() {
  local m="$FLOW_SESSION/quota-wall" epoch
  [ -f "$m" ] || return 1
  epoch=$(sed -n 's/^EPOCH=//p' "$m" 2>/dev/null || true)
  WALL_TAG=$(sed -n 's/^TAG=//p' "$m" 2>/dev/null || true)
  WALL_SHARD=$(sed -n 's/^SHARD=//p' "$m" 2>/dev/null || true)
  case "$epoch" in ''|*[!0-9]*) return 1 ;; esac
  case "$WALL_TAG" in QUOTA|QUOTA-WINDOW) ;; *) return 1 ;; esac
  [ "$epoch" -ge "$START_TS" ]
}

# record_quota_wall TAG: tell the batch this shard hit a wall. Written through a
# temp file so a sibling never reads half a marker. A QUOTA-WINDOW never replaces
# a QUOTA this run can see: the hard wall is the one that needs re-routing.
record_quota_wall() {
  local tag="$1" tmp
  if [ "$tag" = QUOTA-WINDOW ] && quota_wall_valid && [ "$WALL_TAG" = QUOTA ]; then
    return 0
  fi
  if ! tmp=$(mktemp "$FLOW_SESSION/quota-wall.XXXXXX" 2>/dev/null); then
    say "quota wall $tag not recorded: cannot create a temp file in $FLOW_SESSION"
    return 0
  fi
  if ! { printf 'TAG=%s\nSHARD=%s\nEPOCH=%s\n' "$tag" "$SHARD_ID" "$(date +%s)" > "$tmp" \
      && mv -f "$tmp" "$FLOW_SESSION/quota-wall"; } 2>/dev/null; then
    rm -f "$tmp"
    say "quota wall $tag not recorded: cannot write $FLOW_SESSION/quota-wall"
  fi
}

# Step 0 removed the previous round's outcome, so from here on an abort with no
# outcome.md leaves cf-pi-watch.sh waiting on a file that will never appear (its
# all_done tests -s outcome.md) and main with nothing to route. Everything below
# runs under set -e, and the worktree setup + env re-source can both die without
# reaching a write_outcome, so guarantee an outcome on every exit path.
# An intentional no-outcome exit (PREPARED, REBRIEF) sets NO_OUTCOME_EXIT first;
# keying on the exit code instead would let a failing command that happens to
# exit 3 pass for a re-brief.
NO_OUTCOME_EXIT=0
on_exit() {
  local rc=$?
  [ "$NO_OUTCOME_EXIT" -eq 1 ] || [ -s "$OUTCOME_FILE" ] || \
    write_outcome FAIL outcome-missing "" "(all): cf-pi-run aborted before any gate (rc=$rc)" "-" "-" 2>/dev/null || true
  exit "$rc"
}
trap on_exit EXIT

# `bash -c` on a blank string exits 0, so gate 3 would pass and the revert gate
# would name every contract. the integration gate refuses an empty runner too; this sits
# after step 0 and the trap so this round's outcome.md exists for cf.md §3.2 step 2.
case "$TEST_RUNNER" in
  *[![:space:]]*) ;;
  *)
    write_outcome FAIL test-runner-missing "" "(all): blank TEST_RUNNER" "-" "-"
    say "FAIL test-runner-missing"
    exit 1 ;;
esac

# -------- 1-2. prepare: worktree, prerequisite checkpoints, brief -------
# Shared with --prepare-only. Through $SCRIPT_DIR, not
# $SCRIPTS: fixtures stub the worktree and brief scripts it calls via $SCRIPTS.

if [ "$MODE" != gates ]; then
say "preparing shard (worktree, prerequisites, brief)"
prep_rc=0
prep_out=$("$SCRIPT_DIR/cf-pi-prepare.sh" "$SHARD_SESSION" "$GOAL" "$CONSTRAINTS" "$TEST_RUNNER") || prep_rc=$?
if [ "$prep_rc" -ne 0 ]; then
  prep_last=$(printf '%s\n' "$prep_out" | tail -1)
  case "$prep_last" in
    "FAIL "*)
      prep_reason="${prep_last#FAIL }"
      write_outcome FAIL "${prep_reason%% *}" "" "" "-" "-"
      say "$prep_last"
      ;;
  esac
  # No FAIL line (worktree setup died): on_exit records outcome-missing.
  exit 1
fi

# Prepare appended REPO_ROOT/BASE_BRANCH/BASE_HEAD to env.sh; re-source.
load_cf_pi_env "$SHARD_SESSION"
load_cf_flow_env "$FLOW_SESSION"

if [ "$MODE" = prepare ]; then
  echo "PREPARED $BRIEF_FILE"
  NO_OUTCOME_EXIT=1
  exit 0
fi
fi

# -------- 3. probe ------------------------------------------------------

if [ "$MODE" = full ]; then
  say "probing pi"
  PROBE_STATUS=$("$SCRIPTS/cf-pi-probe.sh" "$SHARD_SESSION")
  case "$PROBE_STATUS" in
    OK*)
      say "probe ok"
      ;;
    NO_JSONL*)
      write_outcome FAIL probe-error "" "(all): probe NO_JSONL" "-" "-"
      say "FAIL probe NO_JSONL"
      exit 1
      ;;
    ERROR:*)
      write_outcome FAIL probe-error "" "(all): probe $PROBE_STATUS" "-" "-"
      say "FAIL probe $PROBE_STATUS"
      exit 1
      ;;
    STALLED*)
      write_outcome FAIL probe-stalled "" "(all): probe $PROBE_STATUS" "-" "-"
      say "FAIL probe $PROBE_STATUS"
      exit 1
      ;;
    *)
      write_outcome FAIL probe-error "" "(all): probe unknown ($PROBE_STATUS)" "-" "-"
      say "FAIL probe unknown: $PROBE_STATUS"
      exit 1
      ;;
  esac
fi

# -------- 4-5. dispatch + poll (factored so step 9 can re-dispatch) -----

# dispatch_and_poll [RESUME_PROMPT_FILE]
# With an argument, cf-pi-dispatch.sh resumes the prior OMP session and sends the
# file as the new prompt (context-retaining re-brief); without, fresh dispatch.
dispatch_and_poll() {
  local resume_file="${1:-}"
  # Never launch into a wall the batch has already hit, a re-brief included.
  if quota_wall_valid; then
    write_outcome FAIL "$WALL_TAG" "" "(all): $WALL_TAG sibling-abort (wall hit by shard $WALL_SHARD)" "-" "-"
    say "FAIL $WALL_TAG (wall hit by shard $WALL_SHARD, not dispatching)"
    exit 1
  fi
  say "dispatching pi${resume_file:+ (resume re-brief)}"
  local pre_tip; pre_tip=$(git -C "$WORK" rev-parse HEAD 2>/dev/null || true)
  # Keep the outgoing run dir: on a resume the new one's sessions/ stays empty,
  # so this is where a post-resume failure's evidence lives (newest_jsonl).
  if [ -f "$SHARD_SESSION/pi-rundir" ]; then
    cp "$SHARD_SESSION/pi-rundir" "$SHARD_SESSION/pi-rundir-prev" 2>/dev/null || true
  fi
  # A refusal exits 2, the NEEDS_REPLAN code; left to set -e it would end the
  # shard as an unexplained outcome-missing that routes to replan.
  local pi_pid
  DISPATCH_RC=0
  pi_pid=$("$SCRIPTS/cf-pi-dispatch.sh" "$SHARD_SESSION" ${resume_file:+"$resume_file"} \
             2>"$SHARD_SESSION/dispatch.stderr") || DISPATCH_RC=$?
  if [ "$DISPATCH_RC" -ne 0 ]; then
    write_outcome FAIL dispatch-refused "" "(all): dispatch refused (rc=$DISPATCH_RC)" "-" "-"
    say "FAIL dispatch-refused (rc=$DISPATCH_RC)"
    exit 1
  fi
  cat "$SHARD_SESSION/dispatch.stderr" >&2 2>/dev/null || true
  say "pi pid=$pi_pid"

  local rundir
  rundir="$(cat "$SHARD_SESSION/pi-rundir" 2>/dev/null || true)"

  # Terminal FAIL while pi may still be alive: cancel the orphan tree, capture a
  # postmortem, record the outcome with its reason, and exit.
  fail_kill() {  # reason  diagnostic
    "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
    local pm; pm=$(do_postmortem)
    write_outcome FAIL "$1" "" "(all): $2" "$pm" "-"
    say "FAIL $1"
    exit 1
  }

  # A provider error that ends the turn after the work is done is not an
  # infrastructure failure. 2026-09-29: grok wrote the fix and passed its own
  # tests, then its last message hit Cursor's retryable resource_exhausted, pi
  # exited rc=1, and the re-launch would have redone finished work. When this
  # dispatch left a report or new commits, the gates judge them; gate 1 asks the
  # resumed session for a missing report. Quota walls, timeouts and stalls are
  # matched before the arms that call this and stay failures.
  gates_or_fail() {  # reason  diagnostic
    local tip; tip=$(git -C "$WORK" rev-parse HEAD 2>/dev/null || true)
    if [ -s "$REPORT_FILE" ] || { [ -n "$tip" ] && [ "$tip" != "$pre_tip" ]; }; then
      "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
      say "worker ended on $1 after producing work; the gates judge it ($2)"
      return 0
    fi
    fail_kill "$1" "$2"
  }

  local round=0
  # Ceiling derives from the documented tuning knob: raising PI_WALL_CLOCK_S for
  # heavy briefs (Rust/Docker) must actually lift the hard stop, not just the
  # poll-side guard. rounds = wall-clock / 30s interval, +4 rounds of settle
  # slack so pi-poll's own wall-clock guard fires first (cleaner FAIL cause).
  local max_rounds=$(( ${PI_WALL_CLOCK_S:-1800} / 30 + 4 ))
  while [ "$round" -lt "$max_rounds" ]; do
    round=$((round + 1))
    sleep 30
    local status_line
    status_line=$("$SCRIPTS/cf-pi-poll.sh" "$SHARD_SESSION" 2>&1)
    say "round $round/$max_rounds $status_line"

    # Match the canonical pi-poll.sh STATUS= grammar directly (legacy tokens retired).
    case "$status_line" in
      STATUS=OK*)              return 0 ;;
      RUNNING*)                              # includes "RUNNING settling"
        # A sibling's wall is this worker's wall too: same routing, same spend.
        if quota_wall_valid; then
          fail_kill "$WALL_TAG" "$WALL_TAG sibling-abort (wall hit by shard $WALL_SHARD)"
        fi
        continue ;;
      # A spend wall is not fixed by retrying on the same routing, so the tag
      # becomes the reason main routes on. Matched before every failure arm,
      # only after a space so an OUTPUT= path cannot trip it, and WINDOW first.
      *\ QUOTA-WINDOW*)        record_quota_wall QUOTA-WINDOW; fail_kill QUOTA-WINDOW "poll $status_line" ;;
      *\ QUOTA*)               record_quota_wall QUOTA; fail_kill QUOTA "poll $status_line" ;;
      *exit\ rc=*)             gates_or_fail rc-fail "poll $status_line"; return 0 ;;
      *TIMEOUT*)               fail_kill timeout "poll $status_line" ;;
      *STALL*)                 fail_kill stall "poll $status_line" ;;
      *empty*terminal=stop*)
        # Agent cleanly ended its turn (stopReason=stop) but produced no report/diff
        # (e.g. thinking-only). NOT a stall — detectable at once, fail fast.
        fail_kill no-output "agent ended turn without output ($status_line)" ;;
      *ERROR*|*not-stop*)      gates_or_fail error "poll $status_line"; return 0 ;;
      *died-mid-stream*)
        # rc==0 but no agent_end: events present -> died mid-stream (error);
        # no events at all -> no actionable jsonl.
        if [ -n "$rundir" ] && [ -s "$rundir/result.md" ]; then
          gates_or_fail error "died mid-stream ($status_line)"; return 0
        else
          fail_kill no-jsonl "died with no events ($status_line)"
        fi ;;
      *no-rc*)                 fail_kill no-jsonl "poll $status_line" ;;
      *no-pid*|*handle=broken*)
        # Dispatch handle missing/broken — process already gone, nothing to kill.
        write_outcome FAIL dispatch-broken "" "(all): poll $status_line" "-" "-"
        say "FAIL dispatch-broken"
        exit 1 ;;
      STATUS=FAIL*)            gates_or_fail error "poll $status_line"; return 0 ;;
      *)                       fail_kill poll-unknown "poll unknown ($status_line)" ;;
    esac
  done

  # Exhausted rounds without DONE.
  "$SCRIPTS/cf-pi-stop.sh" "$SHARD_SESSION" --abort >/dev/null 2>&1 || true
  local pm; pm=$(do_postmortem)
  write_outcome FAIL poll-ceiling "" "(all): poll loop ceiling ($max_rounds rounds)" "$pm" "-"
  say "FAIL poll ceiling"
  exit 1
}

if [ "$MODE" = full ]; then
  dispatch_and_poll
fi

# `rebriefs` lists the re-briefs --gates-only already handed back this round, one
# kind per line; --prepare-only and the plain form clear it.
rebrief_recorded() { grep -qxF "$1" "$SHARD_SESSION/rebriefs" 2>/dev/null; }
record_rebrief() { echo "$1" >> "$SHARD_SESSION/rebriefs"; }

report_ok() {
  [ -s "$REPORT_FILE" ] || return 1
  local head_lines; head_lines=$(head -20 "$REPORT_FILE")
  echo "$head_lines" | grep -q '^## Summary' || return 1
  echo "$head_lines" | grep -q '^## Completed' || return 1
}

# Survivors = (declared in this shard) ∩ (claimed Completed in the report).
compute_survivors() {
  local declared cname out=""
  declared=$(shard_contract_names)
  for cname in $(completed_contracts); do
    if echo "$declared" | grep -qxF "$cname"; then
      out="$out${out:+
}$cname"
    fi
  done
  printf '%s' "$out"
}

# -------- 6. escalation -------------------------------------------------

# check_escalation [SURVIVORS]
# Called after EVERY dispatch: a worker can escalate on a re-brief too, and an
# escalation reported as FAIL would be re-launched as an infra failure -- which
# deletes the blocker text at step 0 instead of routing it to Plan. Pass the
# survivors known at the call site: cf.md feeds them to Plan as "preserve these
# interfaces", so dropping them makes Plan re-plan contracts already committed
# on the shard branch. Only the gate-3 site passes them -- there the survivor set
# was established by an earlier, gate-1-valid report. Before gate 1 the only
# report on disk is one written alongside the escalation, which the protocol
# (pi-implementer-protocol.md §4) says to ignore, so those sites pass nothing.
check_escalation() {
  [ -s "$ESCALATE_FILE" ] || return 0
  # Bounded read for header inspection (don't pull content into outcome).
  head -80 "$ESCALATE_FILE" > "$SHARD_SESSION/escalate-snippet.md" 2>/dev/null || true
  local names; names=$(shard_contract_names | awk '{print $0 ": escalate"}')
  write_outcome NEEDS_REPLAN escalate "${1:-}" "$names" "-" "-"
  say "NEEDS_REPLAN escalate"
  exit 2
}

if [ "$MODE" = gates ]; then
  # A Claude builder can escalate while fixing failed tests, after gate 1 already
  # accepted its report. Known survivors then travel with the escalation so Plan
  # preserves them. Before a tests re-brief the only report on disk may be one
  # written beside the escalation, which the protocol says to ignore.
  esc_survivors=""
  if [ -s "$ESCALATE_FILE" ] && rebrief_recorded tests && report_ok; then
    esc_survivors=$(compute_survivors)
  fi
  check_escalation "$esc_survivors"
else
  check_escalation
fi

# -------- 7. gate 1: report file ---------------------------------------

# Self-contained on purpose: when the prior session cannot be resumed, this
# file IS the whole prompt a cold worker receives, so it must name the brief
# and the worktree rather than say "as in the brief".
write_report_rebrief() {
  REPORT_REBRIEF="$SHARD_SESSION/report-re-brief.md"
  {
    printf '## Missing report\n'
    printf 'Your implementation work is NOT in question here and must NOT be redone: `%s` is missing or does not open with the required schema.\n\n' "$REPORT_FILE"
    printf 'Read `%s` (its `## Output Requirements` section holds the exact Report Schema, and `## Behavioral Contracts` names the contracts) and inspect what is already committed on this branch: `git -C %s log --stat %s..HEAD`.\n\n' "$BRIEF_FILE" "$WORK" "$BASE_HEAD"
    printf 'Then write `%s` in that schema — it must start with `## Summary`, followed by `## Completed` with one bullet per contract that is actually implemented on the branch, each carrying its `_(contract: Name)_` suffix. Report only what the commits support; do not claim a contract you cannot point at. Then print DONE.\n' "$REPORT_FILE"
  } > "$REPORT_REBRIEF"
  # Also appended to the brief: cf-pi-dispatch.sh re-sends $BRIEF_FILE whenever
  # pi-rundir is missing, and that is the one fallback where this file is not
  # itself the prompt.
  { printf '\n\n'; cat "$REPORT_REBRIEF"; } >> "$BRIEF_FILE"
}

if [ "$MODE" = gates ] && ! report_ok && ! rebrief_recorded report; then
  # The builder is a Claude session main resumes, not a process this script can
  # re-dispatch: hand the request back once per round, then fail on a second miss.
  say "gate 1 report missing/malformed — handing back a report-only re-brief"
  write_report_rebrief
  record_rebrief report
  NO_OUTCOME_EXIT=1
  echo "REBRIEF report $REPORT_REBRIEF"
  exit 3
fi

if [ "$MODE" = full ] && ! report_ok; then
  # A missing report does not mean missing work: the commits can all be on the
  # branch and the deterministic gates green, with only the write-up skipped.
  # The report is still required -- commit messages carry no cf vocabulary by
  # protocol, so it is the ONLY contract<->commit channel, and step 12 cannot
  # tell an unimplemented contract from an unreported one. So ask for the
  # report alone on the resumed session instead of burning a round re-running
  # finished work.
  say "gate 1 report missing/malformed — asking pi for the report only"
  write_report_rebrief
  dispatch_and_poll "$REPORT_REBRIEF"
  check_escalation
fi

if ! report_ok; then
  pm=$(do_postmortem)
  write_outcome FAIL report-malformed "" "(all): report missing, or missing ## Summary / ## Completed in head -20, after a report-only re-dispatch" "$pm" "-"
  say "FAIL gate1 report missing/malformed"
  exit 1
fi
say "gate 1 ok"

# -------- 8. survivors: contracts this shard both declared and reported done ----
# Survivors = (declared in this shard) ∩ (claimed Completed in the report).
# The former "gate 2 grep guard" -- which matched each contract's prose `expect`
# from contracts.json literally against the test source -- was removed: it
# mechanically checked a non-deterministic validation question (does this test
# capture the intent?), a category error that spuriously demoted virtually every
# well-written test. Verification ("do the tests pass") is gate 3's deterministic
# job; whether the tests meaningfully cover the contract is a judgement for the
# Review phase, not a per-shard grep.

declared_names=$(shard_contract_names)
survivors=$(compute_survivors)
say "survivors=$(echo "$survivors" | grep -c . || true)"

# -------- 9. gate 3: test execution (with at most one re-dispatch) -----

# cf-pi-test.sh prints "test_exit=<n>" and exits with that code. We use exit code directly.
# TEST_RUNNER runs through `bash -c`, as at the integration gate and in cf-rebase.sh,
# so `&&`, env prefixes and quotes mean what they mean in a shell.

# A stalled runner outran its deadline. Re-briefing the builder cannot fix a
# suite that never returns, so stop here instead of spending a dispatch on it.
# Every gate-3 run goes through this, not just the first: a stall on the retest
# or the retry is the same condition, and letting it through routes a hung suite
# into a re-dispatch or into NEEDS_REPLAN.
fail_if_stalled() { # $1 = gate output file
  grep -q '^test_stalled=' "$1" || return 0
  local stall_s pm
  stall_s=$(sed -n 's/^test_stalled=//p' "$1" | head -1)
  pm=$(do_postmortem)
  write_outcome FAIL test-stalled "" "(all): test runner outran its ${stall_s}s deadline" "$pm" "-"
  say "FAIL test-stalled after ${stall_s}s"
  exit 1
}

# run_gate3 OUTFILE: one suite run; sets TEST_RC and TEST_COUNTS.
run_gate3() {
  set +e
  "$SCRIPTS/cf-pi-test.sh" "$SHARD_SESSION" bash -c "$TEST_RUNNER" > "$1" 2>&1
  TEST_RC=$?
  set -e
  TEST_COUNTS="$(sed -n 's/^test_counts=//p' "$1" | tail -1)"
}

# Persistent failure => NEEDS_REPLAN, all this shard's contracts affected.
fail_tests_persistent() {
  local affected pm
  affected=$(shard_contract_names | awk '{print $0 ": gate3 test fail (persistent)"}')
  pm=$(do_postmortem)
  write_outcome NEEDS_REPLAN test-fail-persistent "$survivors" "$affected" "$pm" "-"
  say "NEEDS_REPLAN test-fail-persistent"
  exit 2
}

if [ "$MODE" = gates ] && rebrief_recorded tests; then
  # The builder has had its fix round: exactly one more run decides.
  say "gate 3 re-entry after the fix re-brief, running the suite once"
  run_gate3 "$SHARD_SESSION/gate3-retry.out"
  fail_if_stalled "$SHARD_SESSION/gate3-retry.out"
  [ "$TEST_RC" -eq 0 ] || fail_tests_persistent
else
  run_gate3 "$SHARD_SESSION/gate3.out"
  fail_if_stalled "$SHARD_SESSION/gate3.out"

  if [ "$TEST_RC" -ne 0 ]; then
    # Distinguish "tests failed" from "test runner errored".
    if grep -q '^test_exit=' "$SHARD_SESSION/gate3.out"; then
      # Cheap retest before the expensive re-dispatch: a first-run failure is often an
      # environment transient (parallel shards colliding on a shared port/service), not
      # OMP's code. Re-dispatching OMP for those wastes a full dispatch+poll cycle.
      say "gate 3 first run failed (rc=$TEST_RC), retesting once before re-dispatch"
      run_gate3 "$SHARD_SESSION/gate3-retest.out"
      fail_if_stalled "$SHARD_SESSION/gate3-retest.out"
      if [ "$TEST_RC" -eq 0 ]; then
        say "gate 3 retest passed — first failure was an environment transient"
      else
        # Tests failed twice. One re-brief allowed.
        say "gate 3 failed twice (rc=$TEST_RC), re-briefing the builder"
        REBRIEF_FILE="$SHARD_SESSION/re-brief.md"
        {
          printf '## Previous run feedback\n'
          printf 'The orchestrator ran the test suite and it failed. Inspect the failures and fix. Fold each fix into that contract'\''s EXISTING commit instead of adding fixup commits: `git commit --amend` if it is the branch tip, otherwise `git commit --fixup=<that commit> && GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash %s`. This branch is a private worktree; rewriting it is safe. Then print DONE.\n\n' "$BASE_HEAD"
          printf '### Test output tail (last 30 lines)\n```\n'
          tail -30 "$SHARD_SESSION/gate3-retest.out" 2>/dev/null || tail -30 "$SHARD_SESSION/gate3.out"
          printf '\n```\n'
        } > "$REBRIEF_FILE"
        # Also append to the brief: the fresh-dispatch fallback (no prior session id)
        # re-sends the whole brief, which must then carry the feedback too.
        { printf '\n\n'; cat "$REBRIEF_FILE"; } >> "$BRIEF_FILE"

        if [ "$MODE" = gates ]; then
          # The Claude builder is resumed by main, not re-dispatched here; the
          # next --gates-only call sees `tests` and runs the suite once.
          record_rebrief tests
          NO_OUTCOME_EXIT=1
          echo "REBRIEF tests $REBRIEF_FILE"
          exit 3
        fi

        # Re-dispatch resumes the prior OMP session with only the feedback as the new
        # prompt -- OMP keeps its working context instead of a cold start.
        # dispatch_and_poll exits on failure paths; on DONE returns.
        dispatch_and_poll "$REBRIEF_FILE"
        check_escalation "$survivors"

        run_gate3 "$SHARD_SESSION/gate3-retry.out"
        fail_if_stalled "$SHARD_SESSION/gate3-retry.out"
        [ "$TEST_RC" -eq 0 ] || fail_tests_persistent
      fi
    else
      # No test_exit marker => test runner errored (compile/setup fail).
      pm=$(do_postmortem)
      write_outcome FAIL "test runner error" "" "(all): test runner errored before test_exit" "$pm" "-"
      say "FAIL test runner error"
      exit 1
    fi
  fi
fi
if [ "${TEST_COUNTS:-unparsed}" = unparsed ]; then
  say "gate 3 ok — WARNING: no test counts in the output, the exit code is the only evidence"
else
  say "gate 3 ok ($TEST_COUNTS)"
fi

# -------- 10. actual ⊆ declared file scope -----------------------------
# Mechanism lives in cf-pi-scope.sh so the plain form and --gates-only
# run the identical gate instead of a prose approximation.

set +e
scope_out=$("$SCRIPT_DIR/cf-pi-scope.sh" "$SHARD_SESSION" 2>&1)  # not $SCRIPTS: this gate is never stubbable
scope_rc=$?
set -e
allow_csv=$(printf '%s\n' "$scope_out" | sed -n 's/^ALLOWLISTED //p')
undecl_csv=$(printf '%s\n' "$scope_out" | sed -n 's/^UNDECLARED //p')

if [ "$scope_rc" -ne 0 ] && [ "$scope_rc" -ne 2 ]; then
  pm=$(do_postmortem)
  write_outcome FAIL "scope gate error" "$survivors" "(all): $scope_out" "$pm" "-"
  say "FAIL scope gate error"
  exit 1
fi

if [ -n "$allow_csv" ]; then say "WARN undeclared build/lock files (allowlisted): $allow_csv"; fi

if [ "$scope_rc" -eq 2 ]; then
  affected=$(shard_contract_names | awk '{print $0 ": gate-scope undeclared_file_touched"}')
  write_outcome NEEDS_REPLAN undeclared_file_touched "$survivors" "$affected" "-" "$undecl_csv"
  say "NEEDS_REPLAN undeclared_file_touched ($undecl_csv)"
  exit 2
fi

# -------- 11. capture diff ---------------------------------------------

git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
git -C "$WORK" diff "$BASE_HEAD" > "$DIFF_FILE" 2>/dev/null || true

# -------- 12. completeness gate + write PASS outcome --------------------

if [ -z "$allow_csv" ]; then allow_csv="-"; fi

# PASS requires survivors == declared. A shard that quietly implemented only a
# subset (unimplemented contracts have no failing test yet, so gate 3 can't see
# them) must NOT read as success — route the missing contracts to replan now
# instead of letting Phase-4 Review discover them after a wasted integration.
missing=""
for cname in $declared_names; do
  echo "$survivors" | grep -qxF "$cname" || missing="$missing${missing:+
}$cname"
done
if [ -n "$missing" ]; then
  say "incomplete: declared but not completed: $(echo "$missing" | tr '\n' ' ')"
  write_outcome NEEDS_REPLAN incomplete-contracts "$survivors" "$missing" "-" "$allow_csv"
  say "NEEDS_REPLAN incomplete-contracts"
  exit 2
fi

# -------- 13. revert gate: each contract's tests need its implementation --
# Gate 3 proves the suite is green; it cannot see a test that stays green with
# the code it claims to cover put back to BASE_HEAD, and neither can scope or
# completeness. Runs after step 11, so the diff is the unreverted tree.

declared_count=$(printf '%s\n' "$declared_names" | grep -c . || true)
say "revert gate: $declared_count contract(s), $((declared_count + 1)) suite runs"
GATE_RC=0
"$SCRIPT_DIR/cf-pi-revert-gate.sh" "$SHARD_SESSION" bash -c "$TEST_RUNNER" \
  > "$SHARD_SESSION/revert-gate.out" || GATE_RC=$?  # not $SCRIPTS: this gate is never stubbable
gate_line=$(head -1 "$SHARD_SESSION/revert-gate.out" 2>/dev/null || true)

# Exit code AND verdict line: a gate that dies under set -e (a git failure
# mid-revert) prints no line at all, and bash exits 2 on a syntax error.
case "$GATE_RC:$gate_line" in
  "0:SKIPPED no-git")
    say "WARN revert gate skipped (non-git scratch mode)" ;;
  "0:CLEAN "*)
    say "revert gate ok ($gate_line)" ;;
  "2:STAYS_GREEN "*)
    flagged=$(printf '%s\n' "${gate_line#STAYS_GREEN }" | tr ',' '\n')
    kept=$(printf '%s\n' "$survivors" | grep -vxF -f <(printf '%s\n' "$flagged") || true)
    affected=$(printf '%s\n' "$flagged" | awk 'NF {print $0 ": tests-green-on-revert"}')
    write_outcome NEEDS_REPLAN tests-green-on-revert "$kept" "$affected" "-" "$allow_csv"
    say "NEEDS_REPLAN tests-green-on-revert ($gate_line)"
    exit 2 ;;
  *)
    gate_err=$(grep -m1 '^ERROR ' "$SHARD_SESSION/revert-gate.out" 2>/dev/null || true)
    write_outcome FAIL revert-gate-error "$survivors" \
      "(all): ${gate_err:-revert gate exited $GATE_RC without a verdict}" "-" "-"
    say "FAIL revert-gate-error (${gate_err:-rc=$GATE_RC, no verdict})"
    exit 1 ;;
esac

# All contracts this shard declared + reported survived (gates 1+3 ok, scope ok).
# Allowlisted build/lock touches (if any) surface in undeclared_files for review.
write_outcome PASS none "$survivors" "" "-" "$allow_csv"
say "PASS"
exit 0
