#!/usr/bin/env bash
# Initialize a cf-pi session.
# Usage:   cf-pi-setup.sh [SLUG]   (SLUG = task short name for the branch, kebab-case)
# Stdin:   none
# Stdout:  SESSION path (single line)
# Env in:  PI_PROVIDER, PI_MODEL, PI_STALL_THRESHOLD_S, PI_WALL_CLOCK_S (all optional)
# Side effects:
#   - creates $SESSION (under /tmp)
#   - writes $SESSION/env.sh (sourced by sibling scripts — session-wide vars only;
#     flat per-session paths are derived by load_cf_pi_env)
#   - writes $SESSION/cleanup.sh (worktree script appends to this)
#   - writes $SESSION/README.md (human pointer to inspect/clean up the session)
#   - records PI_AVAILABLE gate into env.sh
#
# Note: loop-budget.json is owned by the /cf orchestrator (commands/cf.md
# Setup block). cf-pi-setup.sh does NOT write it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(dirname "$SCRIPT_DIR")"

SESSION=$(mktemp -d "/tmp/cf-$(date +%m%d)-XXXX")
SESSION_BASENAME="$(basename "$SESSION")"
mkdir -p "$SESSION"

# Optional task short name (kebab, 1-3 words, e.g. "rwd-setup"): becomes the
# branch name cf/<slug>[-shard-X]. Falls back to the session basename.
CF_SLUG="${1:-$SESSION_BASENAME}"

PI_PROVIDER="${PI_PROVIDER:-}"
PI_MODEL="${PI_MODEL:-}"
if [ -n "$PI_PROVIDER" ] || [ -n "$PI_MODEL" ]; then
  PI_DESC="${PI_PROVIDER:-<pi-default-provider>}/${PI_MODEL:-<pi-default-model>}"
else
  PI_DESC="OMP default config"
fi

# Availability gate via the canonical probe — cf owns no agent-binary handling.
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"
PI_AVAILABLE=0
_canon="$(resolve_canon_dispatch)"
if [ -n "${_canon:-}" ] && [ -f "$_canon" ]; then
  "$(dirname "$_canon")/pi-probe.sh" --bin-only >/dev/null 2>&1 && PI_AVAILABLE=1
fi

cat > "$SESSION/env.sh" <<EOF
SESSION="$SESSION"
SESSION_BASENAME="$SESSION_BASENAME"
CF_SLUG="$CF_SLUG"
PLUGIN_ROOT="$PLUGIN_ROOT"
SCRIPTS="$PLUGIN_ROOT/scripts"
PI_PROTOCOL="$PLUGIN_ROOT/docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$SESSION/cleanup.sh"
PI_PROVIDER="$PI_PROVIDER"
PI_MODEL="$PI_MODEL"
PI_DESC="$PI_DESC"
PI_STALL_THRESHOLD_S="${PI_STALL_THRESHOLD_S:-180}"
PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-1800}"
PI_USAGE_CEILING="${PI_USAGE_CEILING:-0.85}"
PI_AVAILABLE=$PI_AVAILABLE
EOF

echo '#!/usr/bin/env bash' > "$SESSION/cleanup.sh"
chmod +x "$SESSION/cleanup.sh"

cat > "$SESSION/README.md" <<EOF
# cf-pi session: $SESSION_BASENAME

OMP-driven implement session. Files are flat under this directory.

## Key files
- \`env.sh\` — session-wide env (provider/model, thresholds, paths)
- \`implement-brief.md\` — brief OMP was given
- \`implement-report.md\` — OMP's final report (present on DONE)
- \`implement.diff\` — captured diff of OMP's work
- \`pi-stdout.log\` / \`pi-stderr.log\` — OMP process output
- \`pi-sessions/*.jsonl\` — OMP JSONL transcript (authoritative state)
- \`pi-probe/\` — pre-flight probe artifacts
- \`work/\` — implementer's working directory (git worktree on branch \`$SESSION/env.sh:CF_BRANCH\`)
- \`cleanup.sh\` — run to capture diff + remove worktree (branch survives for review/merge)

## Inspect
\`\`\`bash
tail -50 $SESSION/pi-stdout.log
ls -t $SESSION/pi-sessions/*.jsonl | head -1 | xargs tail -20
\`\`\`

## Clean up
\`\`\`bash
bash $SESSION/cleanup.sh
rm -rf $SESSION
\`\`\`
EOF

echo "$SESSION"
