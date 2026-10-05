#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

init=obsidian-workspace/skills/init/SKILL.md
step6=$(awk '/^6\. \*\*/{f=1} /^7\. \*\*/{exit} f' "$init")

# One copy of the refresh flow, in the pm skill: init step 6 points to it.
n=$(printf '%s\n' "$step6" | grep -cF '/obw:pm refresh dashboard' || true)
[ "$n" -eq 1 ] || fail "T1: init step 6 /obw:pm refresh dashboard count is $n, want 1"
n=$(grep -cE 'read path=|grep .\^    name:' "$init" || true)
[ "$n" -eq 0 ] || fail "T1: init still carries a dashboard comparison, got $n"
n=$(grep '^description:' "$init" | grep -ci 'dashboard' || true)
[ "$n" -eq 0 ] || fail "T1: init description still names dashboards"

n=$(grep -cF 'predates the Blocked / By Parent / Docs' "$init" || true)
[ "$n" -eq 0 ] || fail "T2: pre-0.9 Blocked phrase still present"
n=$(grep -cF 'Migrate a pre-0.9 project' "$init" || true)
[ "$n" -eq 0 ] || fail "T2: Migrate a pre-0.9 project still present"

# The pre-0.9 checks live in a reference that only step 6 loads.
old=obsidian-workspace/skills/init/references/old-layouts.md
n=$(printf '%s\n' "$step6" | grep -cF '(references/old-layouts.md)' || true)
[ "$n" -eq 1 ] || fail "T3: init step 6 link to old-layouts.md count is $n, want 1"
n=$(grep -cF 'Legacy `archive/`' "$old" || true)
[ "$n" -eq 1 ] || fail "T3: Legacy archive count is $n, want 1"
n=$(grep -cF 'pre-0.9 notes have no `title` property' "$old" || true)
[ "$n" -eq 1 ] || fail "T3: Missing title bullet wording changed, count $n, want 1"
n=$(grep -cE 'Legacy `archive/`|Missing `title`' "$init" || true)
[ "$n" -eq 0 ] || fail "T3: init SKILL.md still carries the pre-0.9 checks, got $n"
n=$(grep '^description:' "$init" | grep -cF 'migrate my obw vault' || true)
[ "$n" -eq 1 ] || fail "T3: init description lost the migrate my obw vault trigger"
# Step 6's condition is recorded before step 5's mkdir creates the folder.
step5=$(awk '/^5\. \*\*/{f=1} /^6\. \*\*/{exit} f' "$init")
order=$(printf '%s\n' "$step5" | grep -oE '^ *(test -d|mkdir -p)' | sed 's/^ *//' | paste -sd, -)
[ "$order" = 'test -d,mkdir -p' ] || fail "T8: step 5 order is $order, want test -d before mkdir -p"

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
n=$(printf '%s\n' "$dash" | grep -cF 'scripts/dashboard-diff.py" project {project}' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards compare command count is $n, want 1"
n=$(cat "$init" "$pm" | grep -cF "grep '^    name:'" || true)
[ "$n" -eq 0 ] || fail "a skill still compares view names only, got $n"
for v in 'verdict: missing' 'verdict: current' 'verdict: stale' 'verdict: edited'; do
  n=$(printf '%s\n' "$dash" | grep -cF "\`$v" || true)
  [ "$n" -eq 1 ] || fail "pm Dashboards must act on \`$v\` once, got $n"
done
n=$(printf '%s\n' "$dash" | grep -cF 'Conversation-mode status (user asks in chat, not Obsidian): run the equivalent `search` and format a summary table in the reply.' || true)
[ "$n" -eq 1 ] || fail "pm Dashboards conversation-mode status sentence count is $n, want 1"

n=$(grep -cF 'templates/dashboard-project.base")" overwrite' "$pm" || true)
[ "$n" -eq 1 ] || fail "pm SKILL dashboard-project overwrite count is $n, want 1"


# base:views ignores path= and lists the views of whichever base is open in Obsidian.
n=$(cat "$init" "$pm" obsidian-workspace/skills/*/references/*.md | grep -cE 'base:views[^`]*path=' || true)
[ "$n" -eq 0 ] || fail "T4: a skill runs base:views with path=, got $n"

# Quoted token only: a comment may still name the verb.
n=$(grep -E "['\"]base:views['\"]" obsidian-workspace/hooks/*.ts | wc -l | tr -d ' ' || true)
[ "$n" -eq 0 ] || fail "T5: a hook runs base:views, got $n"

step1=$(awk '/^1\. \*\*/{f=1} /^2\. \*\*/{exit} f' "$init")
n=$(printf '%s\n' "$step1" | grep -cF 'resolve `$VAULT_PATH` from the `obsidian.json` entry' || true)
[ "$n" -eq 1 ] || fail "T6: init keep-config path resolves VAULT_PATH count is $n, want 1"
step7=$(awk '/^7\. \*\*/{f=1} /^8\. \*\*/{exit} f' "$init")
n=$(printf '%s\n' "$step7" | grep -cF 'On the keep-config path, skip this step: never write `.obsidian.yaml`' || true)
[ "$n" -eq 1 ] || fail "T7: init step 7 keep-config skip count is $n, want 1"
