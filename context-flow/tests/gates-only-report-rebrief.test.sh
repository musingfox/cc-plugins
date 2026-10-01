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
