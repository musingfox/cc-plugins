#!/usr/bin/env bash
# Render a deepen survey report via the sibling `viz` plugin.
# Falls back to printing the report inline when viz is absent or fails.
#
# Usage: render-survey.sh <report.md> [output-name]
#
# Why a resolver and not a hard path: plugins install under two layouts and viz carries
# its own version, so a fixed `../viz/lib/render.sh` cannot reach it:
#   - dev marketplace (flat):       <marketplace>/viz/lib/render.sh
#   - installed cache (versioned):  <marketplace>/viz/<version>/lib/render.sh

report="${1:?usage: render-survey.sh <report.md> [output-name]}"
name="${2:-deepen-survey}"

if [ ! -f "$report" ]; then
  echo "[deepen] report not found: $report" >&2
  exit 1
fi

root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

render="$(ls "$root"/../viz/lib/render.sh \
             "$root"/../viz/*/lib/render.sh \
             "$root"/../../viz/lib/render.sh \
             "$root"/../../viz/*/lib/render.sh 2>/dev/null | sort -V | tail -1)"

inline() {
  echo "report at: $report" >&2
  cat "$report"
  echo "[deepen] render=inline"
  exit 0
}

if [ -n "$render" ] && [ -f "$render" ]; then
  set +e
  out="$(bash "$render" "$report" "$name")"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    printf '%s\n' "$out"
    echo "[deepen] render=viz"
    exit 0
  fi
fi

inline
