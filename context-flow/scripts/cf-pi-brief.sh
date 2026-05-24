#!/usr/bin/env bash
# Assemble Pi implementation brief for ONE shard.
# Reads contracts.json + shards.json (flow-level) + protocol fenced sections;
# writes a per-shard brief that includes:
#   - Methodology + report schema (from $PI_PROTOCOL fenced markers)
#   - Context Summary (goal + constraints + test runner)
#   - Environment block (WORK_DIR / CF_BRANCH / BASE_HEAD / REPORT_FILE / ESCALATE_FILE / SHARD_GROUP / rules)
#   - Behavioral Contracts (this shard's subset, rendered from contracts.json)
#   - Verbatim attachments[].path content (rich prose escape hatch)
#   - Output Requirements (report schema + DONE marker + escalate option)
#
# Usage:   cf-pi-brief.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER
#   SHARD_SESSION must be a per-shard session dir created by cf-pi-shard.sh
#   (i.e. its env.sh sets SESSION + FLOW_SESSION + SHARD_ID).
# Stdout:  $BRIEF_FILE path on success
# Exit:    non-zero with BRIEF MALFORMED on stderr if input is missing/empty.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 4 ]; then
  echo "Usage: cf-pi-brief.sh SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "BRIEF MALFORMED: jq is required" >&2
  exit 1
fi

session="$1"; goal="$2"; constraints="$3"; test_runner="$4"
load_cf_pi_env "$session"

# Derive flow-level paths (FLOW_SESSION + SHARD_ID come from per-shard env.sh).
if [ -z "${FLOW_SESSION:-}" ] || [ -z "${SHARD_ID:-}" ]; then
  echo "BRIEF MALFORMED: $session/env.sh missing FLOW_SESSION or SHARD_ID -- not a sharded session" >&2
  exit 1
fi
load_cf_flow_env "$FLOW_SESSION"

if [ ! -f "$CONTRACTS_FILE" ]; then
  echo "BRIEF MALFORMED: contracts.json missing at $CONTRACTS_FILE" >&2
  exit 1
fi
if [ ! -f "$SHARDS_FILE" ]; then
  echo "BRIEF MALFORMED: shards.json missing at $SHARDS_FILE" >&2
  exit 1
fi
if [ ! -f "$PI_PROTOCOL" ]; then
  echo "BRIEF MALFORMED: PI_PROTOCOL not set or missing ($PI_PROTOCOL)" >&2
  exit 1
fi

# Which contracts belong to this shard?
shard_contract_names=$(jq -r --arg sid "$SHARD_ID" '.groups[$sid].contracts[]' "$SHARDS_FILE" 2>/dev/null || true)
if [ -z "$shard_contract_names" ]; then
  echo "BRIEF MALFORMED: no contracts found for shard $SHARD_ID in $SHARDS_FILE" >&2
  exit 1
fi

# Extract methodology + report schema from protocol via fenced markers.
sed -n '/<!-- METHODOLOGY-BEGIN -->/,/<!-- METHODOLOGY-END -->/{//!p;}' \
  "$PI_PROTOCOL" > "$session/brief-methodology.md"
sed -n '/<!-- SCHEMA-BEGIN -->/,/<!-- SCHEMA-END -->/{//!p;}' \
  "$PI_PROTOCOL" > "$session/brief-report-schema.md"

for f in brief-methodology.md brief-report-schema.md; do
  if [ ! -s "$session/$f" ]; then
    echo "BRIEF MALFORMED: $session/$f is empty (missing fenced markers in $PI_PROTOCOL)" >&2
    exit 1
  fi
done

# Render this shard's contracts from contracts.json.
render_contracts() {
  local name
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    jq -r --arg n "$name" '
      .contracts[] | select(.name == $n) |
      "### " + .name + "\n" +
      (if .summary then "- **summary**: " + .summary + "\n" else "" end) +
      "- **touches_files**:\n" +
      (.touches_files // [] | map("  - " + .) | join("\n")) + "\n" +
      (if (.test_cases // []) | length > 0
        then "- **test_cases**:\n" +
          ((.test_cases // []) | map(
            "  - " + (.id // "") + ": given " + (.given // "") + " -> expect " + (.expect // "")
          ) | join("\n")) + "\n"
        else "" end) +
      (if (.attachments // []) | length > 0
        then "- **attachments**:\n" +
          ((.attachments // []) | map("  - " + .name + " -> " + .path) | join("\n")) + "\n"
        else "" end)
    ' "$CONTRACTS_FILE"
    echo
  done <<< "$shard_contract_names"
}

# Render attachment file contents verbatim (if any) so Pi reads them without extra fetches.
render_attachments() {
  local name
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    jq -r --arg n "$name" '
      .contracts[] | select(.name == $n) |
      (.attachments // [])[] |
      "::: attachment for " + $n + " (" + .name + ") path=" + .path
    ' "$CONTRACTS_FILE" | while IFS= read -r header; do
      [ -z "$header" ] && continue
      # Extract path from header line
      path=$(echo "$header" | sed -n 's/.* path=//p')
      if [ -n "$path" ]; then
        # Attachment paths are relative to $FLOW_SESSION (per design §3).
        local abs="$FLOW_SESSION/$path"
        if [ -f "$abs" ]; then
          echo "$header"
          echo
          cat "$abs"
          echo
          echo ":::"
          echo
        else
          echo "$header  [MISSING -- attachment file not found at $abs]"
          echo
        fi
      fi
    done
  done <<< "$shard_contract_names"
}

shard_group="$SHARD_ID"

{
  echo "# Implementation Brief"; echo
  echo "## Methodology"; echo
  cat "$session/brief-methodology.md"; echo

  echo "## Context Summary"
  echo "- **Goal**: $goal"
  echo "- **Key constraints**: $constraints"
  echo "- **Shard**: $SHARD_ID (handles $(echo "$shard_contract_names" | wc -l | tr -d ' ') contract(s))"
  echo "- **Test runner**: \`$test_runner\`"
  echo

  echo "## Environment"
  echo "- **WORK_DIR**: \`$WORK\`     (you are already on the cf branch here)"
  echo "- **CF_BRANCH**: \`$CF_BRANCH\`     (commit per-contract to this branch)"
  echo "- **BASE_HEAD**: \`${BASE_HEAD:-(unset)}\`     (compute diffs against this commit)"
  echo "- **REPORT_FILE**: \`$REPORT_FILE\`     (write your structured report here)"
  echo "- **ESCALATE_FILE**: \`$ESCALATE_FILE\`     (write here ONLY when stuck per Escalation Contract below)"
  echo "- **TEST_RUNNER**: \`$test_runner\`     (run via the orchestrator's gate, do not re-invoke yourself unless verifying)"
  echo "- **SHARD_GROUP**: \`$shard_group\`"
  echo
  echo "## Rules"
  echo "- All file writes MUST stay inside WORK_DIR. Never \`cd\` out, never edit files in the parent repo checkout."
  echo "- Forbidden: \`git push\`, \`git remote\` operations, modifying or switching to any branch other than CF_BRANCH."
  echo "- Per-contract commit to CF_BRANCH (see Methodology). Use the contract name in the commit subject."
  echo "- If a referenced file is missing, consult the contract's touches_files list. Do NOT invent locations under other paths."
  echo "- You will be measured against the contracts in this brief ONLY. Do not implement anything outside touches_files of these contracts."
  echo

  echo "## Behavioral Contracts (this shard)"; echo
  render_contracts; echo

  # Inline attachments if any contract has them.
  attachments_present=$(jq -r --arg sid "$SHARD_ID" --slurpfile sh <(cat "$SHARDS_FILE") '
    [.contracts[] | select(.name as $n | $sh[0].groups[$sid].contracts | index($n)) | .attachments // []] | add // [] | length
  ' "$CONTRACTS_FILE" 2>/dev/null || echo 0)
  if [ "$attachments_present" -gt 0 ] 2>/dev/null; then
    echo "## Attachments (verbatim)"; echo
    render_attachments
  fi

  echo "## Escalation Contract"
  echo
  echo "Write \`$ESCALATE_FILE\` and print \`DONE\` if any of the following holds:"
  echo "- A contract is internally inconsistent, contradicts another, or is infeasible as specified."
  echo "- A required file/module from touches_files does not exist AND creating it would change the architectural shape."
  echo "- A required dependency is missing and cannot be installed safely."
  echo "- The same test failure pattern recurs across two distinct fix attempts."
  echo
  echo "Escalation file schema:"
  echo
  echo '```markdown'
  echo "## Blocker"
  echo "{one-line summary}"
  echo
  echo "## Affected contracts"
  echo "- {ContractName}"
  echo
  echo "## What I tried"
  echo "- {bullet}"
  echo
  echo "## What I need from Plan/Research"
  echo "{specific question or concrete unblock action}"
  echo '```'
  echo

  echo "## Output Requirements"; echo
  echo "You MUST write your report to \`$REPORT_FILE\` using EXACTLY this schema:"; echo
  cat "$session/brief-report-schema.md"; echo
  echo "After writing the report and only after all tests pass, your stdout must print exactly: \`DONE\`"
  echo "If you wrote \`$ESCALATE_FILE\` per the Escalation Contract, print \`DONE\` and exit -- do NOT also write a misleading report."
} > "$BRIEF_FILE"

# Final sanity check: minimum heading count
headers=$(grep -c '^## ' "$BRIEF_FILE")
if [ "$headers" -lt 7 ]; then
  echo "BRIEF MALFORMED: only $headers '## ' headers (expected >=7)" >&2
  exit 1
fi

echo "$BRIEF_FILE"
