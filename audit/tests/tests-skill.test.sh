#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }
frontmatter() { awk 'NR == 1 && /^---$/ { f = 1; next } f && /^---$/ { exit } f' "$1"; }

s=audit/skills/tests/SKILL.md
a=audit/agents/tests-tracer.md

frontmatter "$s" | grep -qx 'name: tests' || fail "T1 name"
frontmatter "$s" | grep -qx 'disable-model-invocation: true' || fail "T1 user-invoked"
frontmatter "$s" | grep -Fqx 'argument-hint: "[repo path]"' || fail "T1 argument-hint"

grep -Fq '`audit:tests-tracer`' "$s" || fail "T2 the skill dispatches the tracer"
frontmatter "$a" | grep -qx 'name: tests-tracer' || fail "T2 agent name"

# Prints each ${CLAUDE_PLUGIN_ROOT}/<rel> in a file that does not resolve to audit/<rel>.
missing_refs() {
  grep -oE '\$\{CLAUDE_PLUGIN_ROOT\}/[A-Za-z0-9_./-]+' "$1" | sed 's|^\${CLAUDE_PLUGIN_ROOT}/||' \
    | while read -r rel; do [ -f "audit/$rel" ] || echo "$rel"; done
}
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/nope.sh"\n' > "$tmp/synthetic.md"
[ "$(missing_refs "$tmp/synthetic.md")" = scripts/nope.sh ] || fail "T4 broken resolver: a missing script was not flagged"
[ -z "$(missing_refs "$s")" ] || fail "T3 unresolved: $(missing_refs "$s")"
for n in milestones test-files assemble; do
  grep -Fq "\${CLAUDE_PLUGIN_ROOT}/scripts/$n.sh" "$s" || fail "T3 names scripts/$n.sh"
done

for w in 'exits 2' 'No standing milestones' 'mktemp -d'; do
  grep -Fq "$w" "$s" || fail "T5 body names $w"
done
