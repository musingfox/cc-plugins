#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

init=obsidian-workspace/skills/init/SKILL.md
step6=$(awk '/^6\. \*\*/{f=1} /^7\. \*\*/{exit} f' "$init")

n=$(printf '%s\n' "$step6" | grep -c 'hand edits' || true)
[ "$n" -ge 1 ] || fail "T1: init step 6 hand edits count is $n, want >=1"

n=$(grep -cF 'predates the Blocked / By Parent / Docs' "$init" || true)
[ "$n" -eq 0 ] || fail "T2: pre-0.9 Blocked phrase still present"
n=$(grep -cF 'Migrate a pre-0.9 project' "$init" || true)
[ "$n" -eq 0 ] || fail "T2: Migrate a pre-0.9 project still present"

n=$(printf '%s\n' "$step6" | grep -cF 'Legacy `archive/`' || true)
[ "$n" -eq 1 ] || fail "T3: Legacy archive count is $n, want 1"
n=$(printf '%s\n' "$step6" | grep -cF 'pre-0.9 notes have no `title` property' || true)
[ "$n" -eq 1 ] || fail "T3: Missing title bullet wording changed, count $n, want 1"
n=$(grep '^description:' "$init" | grep -cF 'migrate my obw vault' || true)
[ "$n" -eq 1 ] || fail "T3: init description lost the migrate my obw vault trigger"
n=$(printf '%s\n' "$step6" | grep -cF 'read path="pm/<PROJECT_NAME>/dashboard.base"' || true)
[ "$n" -eq 1 ] || fail "T1: init step 6 literal read path count is $n, want 1"
n=$(printf '%s\n' "$step6" | grep -cF 'Missing `title`' || true)
[ "$n" -eq 1 ] || fail "T3: Missing title count is $n, want 1"

readme=$(awk '/^## Vault Layout/,/^## Filenames/' obsidian-workspace/README.md)
n=$(printf '%s\n' "$readme" | grep -cF '/obw:pm refresh dashboard' || true)
[ "$n" -ge 1 ] || fail "README Vault Layout refresh dashboard count is $n, want >=1"
n=$(printf '%s\n' "$readme" | grep -cF 'All Tasks' || true)
[ "$n" -ge 1 ] || fail "README Vault Layout All Tasks count is $n, want >=1"
n=$(printf '%s\n' "$readme" | grep -cF 'hand edits' || true)
[ "$n" -ge 1 ] || fail "README Vault Layout hand edits count is $n, want >=1"
n=$(printf '%s\n' "$readme" | grep -cF 'Upgrading a vault from before 0.9: re-run `/obw:init`' || true)
[ "$n" -eq 1 ] || fail "README Vault Layout pre-0.9 upgrade line count is $n, want 1"

pm=obsidian-workspace/skills/pm/SKILL.md
dash=$(awk '/^## Dashboards/,/^## Important Rules/' "$pm")
n=$(printf '%s\n' "$dash" | grep -c 'refresh dashboard' || true)
[ "$n" -ge 1 ] || fail "pm Dashboards refresh dashboard count is $n, want >=1"
n=$(printf '%s\n' "$dash" | grep -cF 'read path="pm/{project}/dashboard.base"' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards read path count is $n, want 1"
n=$(printf '%s\n' "$dash" | grep -c 'hand edits' || true)
[ "$n" -ge 1 ] || fail "pm Dashboards hand edits count is $n, want >=1"
n=$(printf '%s\n' "$dash" | grep -cF '"${CLAUDE_PLUGIN_ROOT}/templates/dashboard-project.base"`' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards template names grep count is $n, want 1"
n=$(printf '%s\n' "$dash" | grep -c 'missing from the vault' || true)
[ "$n" -ge 1 ] || fail "pm Dashboards must report missing view names"
n=$(printf '%s\n' "$dash" | grep -c 'base file is not found' || true)
[ "$n" -ge 1 ] || fail "pm Dashboards must handle a missing base file"
n=$(printf '%s\n' "$dash" | grep -cF 'Conversation-mode status (user asks in chat, not Obsidian): run the equivalent `search` and format a summary table in the reply.' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards conversation-mode status sentence count is $n, want 1"

n=$(grep -cF 'templates/dashboard-project.base")" overwrite' "$pm" || true)
[ "$n" -eq 1 ] || fail "pm SKILL dashboard-project overwrite count is $n, want 1"


# base:views ignores path= and lists the views of whichever base is open in Obsidian.
n=$(cat "$init" "$pm" | grep -cE 'base:views[^`]*path=' || true)
[ "$n" -eq 0 ] || fail "T4: a skill runs base:views with path=, got $n"
