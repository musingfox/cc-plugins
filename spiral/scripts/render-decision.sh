#!/usr/bin/env bash
# Render a spiral decision brief to HTML via the sibling `viz` plugin, then open it.
# Falls back to printing the brief inline when viz is absent (uninstalled / headless),
# so a decision is never reduced to bare AskUserQuestion labels.
#
# Usage: render-decision.sh <brief.md> <output-name>
#
# Why a resolver and not a hard path: plugins install under two layouts and viz carries
# its own version, so a fixed `../viz/lib/render.sh` cannot reach it:
#   - dev marketplace (flat):       <marketplace>/viz/lib/render.sh
#   - installed cache (versioned):  <marketplace>/viz/<version>/lib/render.sh

brief="${1:?usage: render-decision.sh <brief.md> <output-name>}"
name="${2:-spiral-decision}"

if [ ! -f "$brief" ]; then
  echo "[spiral] brief not found: $brief" >&2
  exit 1
fi

# spiral's own root: CLAUDE_PLUGIN_ROOT when invoked by the plugin, else this script's parent.
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Search both layouts at both depths; if several match, take the highest version.
render="$(ls "$root"/../viz/lib/render.sh \
             "$root"/../viz/*/lib/render.sh \
             "$root"/../../viz/lib/render.sh \
             "$root"/../../viz/*/lib/render.sh 2>/dev/null | sort -V | tail -1)"

if [ -n "$render" ] && [ -f "$render" ]; then
  exec bash "$render" "$brief" "$name"
fi

echo "[spiral] viz render.sh not found — decision brief (read inline):" >&2
echo "----------------------------------------------------------------------" >&2
cat "$brief"
