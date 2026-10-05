#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# The task schema lives in three places: the template the vault installs, the
# pm skill's Property Schema and the README's. They name the same fields, and
# the template carries the `## Agent` section the writeback hook appends to.
cd obsidian-workspace

fail() { echo "  ✗ $*"; exit 1; }

# fields LINE: the backticked field names, with the "(…)" value lists dropped.
fields() { sed 's/([^)]*)//g' | grep -oE '`[a-z_]+' | tr -d '`' | sort -u | paste -sd, -; }

skill_keys="$(grep '^\*\*Task\*\*:' skills/pm/SKILL.md | fields)"
readme_keys="$(grep -- '^- \*\*Task\*\* —' README.md | fields)"
# `completed` is set on archive, so the template leaves it out.
template_keys="$( { awk '/^---$/{n++; next} n==1' templates/task.md | sed -n 's/^\([a-z_]*\):.*/\1/p'; echo completed; } | sort -u | paste -sd, -)"

[ "$skill_keys" = "$readme_keys" ] || fail "SKILL.md Task fields [$skill_keys] != README [$readme_keys]"
[ "$skill_keys" = "$template_keys" ] || fail "SKILL.md Task fields [$skill_keys] != template [$template_keys]"
case ",$template_keys," in *,session,*) ;; *) fail "the task schema has no session field" ;; esac
grep -qx '## Agent' templates/task.md || fail "template has no ## Agent section"
echo "ok"
