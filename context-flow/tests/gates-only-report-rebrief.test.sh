#!/usr/bin/env bash
# cf-pi-run.sh --gates-only hands a missing or malformed report back to the
# Claude builder once per round (REBRIEF report, exit 3, no outcome.md) and
# fails report-malformed on the second miss. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

status_of() { sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md"; }
reason_of() { sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md"; }

# T1-T3: first miss, second miss, recovery
fx_build
fx_stale_outcome
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "3" "$RC" "T1 exit"
assert_eq "REBRIEF report $SHARD/report-re-brief.md" "$(fx_last)" "T1 last stdout line"
assert_eq absent "$(fx_exists "$SHARD/outcome.md")" "T1 no outcome.md"
assert_contains "$(cat "$SHARD/rebriefs")" "report" "T1 rebriefs records report"
assert_contains "$(cat "$SHARD/implement-brief.md")" "Missing report" "T1 request appended to brief"
assert_eq absent "$(fx_exists "$FLOW/test.count")" "T1 no later gate ran"

fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "1" "$RC" "T2 exit"
assert_eq "report-malformed" "$(reason_of)" "T2 Reason"
fx_clean

fx_build
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "3" "$RC" "T3 first exit"
fx_report valid
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T3 second exit"
assert_eq "PASS" "$(status_of)" "T3 Status"
fx_clean

# T4: Completed past line 20 is malformed
fx_build
fx_report late
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "3" "$RC" "T4 exit"
case "$(fx_last)" in "REBRIEF report"*) assert_eq ok ok "T4 last line" ;; *) assert_eq "REBRIEF report" "$(fx_last)" "T4 last line" ;; esac
fx_clean

# T5: a failing command that happens to exit 3 is not a re-brief
fx_build
fx_report valid
printf '#!/bin/bash\nexit 3\n' > "$STUBS/jq"
chmod +x "$STUBS/jq"
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "3" "$RC" "T5 exit"
assert_contains "$(cat "$SHARD/outcome.md" 2>/dev/null)" "outcome-missing" "T5 outcome-missing recorded"
case "$(fx_last)" in REBRIEF*) assert_eq "no REBRIEF" "$(fx_last)" "T5 last line" ;; *) assert_eq ok ok "T5 last line is not a REBRIEF" ;; esac
fx_clean

# T6: a Completed tag that names no single contract of this shard (a count, a
# list, an unknown name) is a report-format miss, not unfinished work: it gets
# the report-only re-brief naming the tag instead of incomplete-contracts.
fx_build
printf '## Summary\nDid the work.\n\n## Completed\n- Everything else _(contract: remaining 29)_\n' > "$SHARD/implement-report.md"
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "3" "$RC" "T6 exit"
assert_eq "REBRIEF report $SHARD/report-re-brief.md" "$(fx_last)" "T6 last stdout line"
assert_contains "$(cat "$SHARD/report-re-brief.md" 2>/dev/null)" '`remaining 29`' "T6 re-brief names the bad tag"
fx_report valid
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T6 rewritten report passes"
fx_clean

# T7-T8: a re-run of a shard that already passed. A declared contract found in
# no Completed or Unresolved bullet is a report-format miss, not unfinished
# work: the re-brief names it instead of the run ending incomplete-contracts.
fx_rerun_shard() {
  fx_build
  cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1", "C2", "C3"], "files": ["src/x.ts"]}}}
JSON
  cat > "$FLOW/contracts.json" <<'JSON'
{"schema_version": 1, "contracts": [{"name": "C1", "touches_files": ["src/x.ts"]}, {"name": "C2", "touches_files": ["src/x.ts"]}, {"name": "C3", "touches_files": ["src/x.ts"]}]}
JSON
  printf '{"checkpoints": {"A": "cf-test-A-r1"}}\n' > "$FLOW/dispatch-state.json"
}

# T7: only the fixed contract in Completed; C2 only under Concerns, C3 nowhere
fx_rerun_shard
printf '## Summary\nFixed C1.\n\n## Completed\n- C1 now works _(contract: C1)_\n\n## Concerns\n- C2 is fragile _(contract: C2)_\n' > "$SHARD/implement-report.md"
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "3" "$RC" "T7 exit"
assert_eq "REBRIEF report $SHARD/report-re-brief.md" "$(fx_last)" "T7 last stdout line"
assert_eq absent "$(fx_exists "$SHARD/outcome.md")" "T7 no outcome.md"
assert_contains "$(cat "$SHARD/report-re-brief.md" 2>/dev/null)" '`C2`, `C3`' "T7 re-brief names the unlisted contracts"
printf '## Summary\nAll three.\n\n## Completed\n- C1 now works _(contract: C1)_\n- C2 works _(contract: C2)_\n- C3 works _(contract: C3)_\n' > "$SHARD/implement-report.md"
fx_run --gates-only "$SHARD" goal none "$RUNNER"
case "$(fx_last)" in REBRIEF*) assert_eq "no REBRIEF" "$(fx_last)" "T7 rewritten report" ;; *) assert_eq ok ok "T7 rewritten report clears gate 1" ;; esac
case "$(reason_of)" in incomplete-contracts) assert_eq "not incomplete-contracts" "$(reason_of)" "T7 rewritten report Reason" ;; *) assert_eq ok ok "T7 rewritten report is not incomplete-contracts" ;; esac
fx_clean

# T8: a contract under Unresolved is reported, so it still routes to replan
fx_rerun_shard
printf '## Summary\nFixed C1.\n\n## Completed\n- C1 now works _(contract: C1)_\n- C3 works _(contract: C3)_\n\n## Unresolved\n- C2 blocked _(contract: C2)_\n' > "$SHARD/implement-report.md"
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "2" "$RC" "T8 exit"
assert_eq "incomplete-contracts" "$(reason_of)" "T8 Reason"
fx_clean
