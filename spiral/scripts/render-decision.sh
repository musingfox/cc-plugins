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

# Refuse a brief the waiter would misread. wait-decision.sh returns on any
# non-empty answer key, so a key written pre-filled (a trailing `# comment` is a
# value here) arrives as a Save nobody made. A 改回成本 row whose first cell is
# not exactly one of its decision's options gets no card in the viz recipe.
# The answer-key pattern is the waiter's, so the two agree on "answered".
# LC_ALL=C: macOS awk (20200816) compares strings with == by locale collation,
# which POSIX.1-2024 no longer allows, and under a UTF-8 locale two different
# CJK headings collate equal and match the wrong decision.
problems="$(LC_ALL=C awk '
  function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
  function unquote(s) { s = trim(s); gsub(/^["\047]|["\047]$/, "", s); return s }
  NR == 1 { if ($0 == "---") { fm = 1; next } }
  fm && /^---$/ { fm = 0; next }
  fm {
    if (match($0, /^([A-Za-z0-9_-]+\.)?(choice|notes):/) && trim(substr($0, RLENGTH + 1)) != "")
      print "pre-filled answer key (write it empty): " $0
    if (match($0, /^[^.:[:space:]]+\.title:/)) { id = substr($0, 1, index($0, ".") - 1); title[id] = unquote(substr($0, RLENGTH + 1)) }
    if (match($0, /^[^.:[:space:]]+\.options:/)) {
      id = substr($0, 1, index($0, ".") - 1); v = substr($0, RLENGTH + 1); gsub(/｜/, "|", v)
      n = split(v, parts, "|")
      for (i = 1; i <= n; i++) { o = unquote(parts[i]); if (o != "") { opt[id SUBSEP o] = 1; anyopt[o] = 1 } }
    }
    next
  }
  /^[ \t]*(```|~~~)/ { fence = !fence; next }
  fence { next }
  /^## / { section = trim(substr($0, 4)); owner = ""; for (id in title) if (title[id] == section) owner = id }
  !/^[ \t]*\|/ { table = 0; next }
  table == 0 { table = (index($0, "改回成本") ? 2 : 1); next }
  table == 2 && /^[ \t]*\|[ \t:|-]*$/ { next }
  table == 2 {
    cell = $0; sub(/^[ \t]*\|/, "", cell); sub(/\|.*/, "", cell); gsub(/\*\*/, "", cell); cell = trim(cell)
    if (owner != "" ? !((owner SUBSEP cell) in opt) : !(cell in anyopt))
      print "row label \"" cell "\" under \"## " section "\" is not in " (owner != "" ? owner ".options" : "any dN.options")
  }
' "$brief")"
if [ -n "$problems" ]; then
  printf '[spiral] brief rejected: %s\n' "$brief" >&2
  printf '%s\n' "$problems" | sed 's/^/[spiral]   /' >&2
  echo "[spiral] fix the brief and run render-decision again" >&2
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
  # Capture (don't exec) so we can classify the outcome: a real `URL: http://`
  # means the viz server is up and the in-browser Save endpoint works, so the
  # agent can background-wait on the Save. Anything else (server port held →
  # file://, headless, render failure) means Save is dead — the agent must take
  # the terminal fallback. stderr still streams straight through.
  out="$(bash "$render" "$brief" "$name")"
  printf '%s\n' "$out"
  if printf '%s\n' "$out" | grep -q 'URL: http://'; then
    echo "[spiral] save-mode=browser"
  else
    echo "[spiral] save-mode=inline   # viz Save unavailable — use terminal fallback"
  fi
  exit 0
fi

echo "[spiral] viz render.sh not found — decision brief (read inline):" >&2
echo "----------------------------------------------------------------------" >&2
cat "$brief"
echo "[spiral] save-mode=inline   # viz absent — use terminal fallback"
