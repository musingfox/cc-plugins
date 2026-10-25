#!/usr/bin/env bash
# Pins the decision page: at the top, narrow.md's round and depth gate put a
# round on the browser page, and decision-page.md carries the brief format, the
# body layout and the read-back rules; below the top a round is still a BLOCKED
# report. The plugin declares viz, which renders the page.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"

ROOT="$(cd "$METHOD_TESTS_DIR/.." && pwd)"
SKILL="$ROOT/skills/method"
narrow="$SKILL/narrow.md"
page="$SKILL/decision-page.md"

# Section of narrow.md from a heading line to the next heading.
section() { awk -v h="$1" '$0 == h {on=1; next} on && /^#/ {exit} on' "$narrow"; }

assert_eq '["viz"]' "$(jq -c '.dependencies' "$ROOT/.claude-plugin/plugin.json")" "plugin.json declares the viz dependency"

# Step 2 and step 5 both say how to put the round on the page.
for h in '## 2. The round' '## 5. The depth gate'; do
  sec="$(section "$h")"
  assert_contains "$sec" "decision-page.md" "narrow: $h points at decision-page.md"
  assert_contains "$sec" "render-decision.sh" "narrow: $h renders with render-decision.sh"
  assert_contains "$sec" "wait-decision.sh" "narrow: $h waits with wait-decision.sh"
  assert_contains "$sec" "viz: feedback" "narrow: $h writes the brief in the viz: feedback shape"
  assert_contains "$sec" "URL:" "narrow: $h hands the human the URL: line"
  assert_contains "$sec" "save-mode=inline" "narrow: $h falls back on save-mode=inline"
  assert_contains "$sec" "AskUserQuestion" "narrow: $h asks inline with AskUserQuestion on the fallback"
done
who="$(section '## Who decides')"
assert_contains "$who" "BLOCKED" "narrow: below the top a round is still a BLOCKED report"

# The ported brief format, body layout and read-back rules.
doc="$(cat "$page" 2>/dev/null)"
for k in \
  'viz: feedback' 'd1.options:' 'd1.recommend:' 'd1.multi:' 'd1.choice:' 'd1.notes:' \
  'Write no trailing comments' 'pre-answered' \
  'I cannot tell these apart' \
  '好處' '代價' '改回成本' '### <label>' 'blockquote' 'Mermaid' '發現' '證據' '後果' \
  'exactly as written in `dN.options`' \
  '[method] brief rejected:' 'save-mode=browser' 'run_in_background' 'URL:' \
  'A timeout (exit 2) is not an answer' 're-arm' \
  'never on how you woke' 'Never read a blank as agreement' 'literal' 'TaskStop' \
  '<plugin root>/scripts/render-decision.sh' '<plugin root>/scripts/wait-decision.sh'
do
  assert_contains "$doc" "$k" "decision-page: $k"
done

# What only the /spiral command needed stays behind.
assert_eq "" "$(grep -nE 'concept\.md|ascent\.md|/spiral|\[spiral\]|CLAUDE_PLUGIN_ROOT' "$page" 2>/dev/null || true)" "decision-page: no /spiral command machinery"
