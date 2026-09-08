---
name: marketplace
description: >-
  Use when working on the cc-plugins repository itself: adding a plugin, renaming one,
  removing one, bumping a version, or after editing any plugin's components. Also when
  writing or revising a skill's description or body, or editing CLAUDE.md — WRITING.md
  carries the judgment for that. Enforces the repo's four-file invariant — plugin.json,
  marketplace.json, README.md, and the version bump that makes Claude Code refresh its
  cache.
allowed-tools: Read Edit Write Glob Grep Bash(git status *) Bash(git diff *) Bash(ls *)
---

# cc-plugins marketplace maintenance

This repo is a marketplace of independent plugins. Four things must agree at all
times; any one of them drifting is a defect, not a cosmetic issue.

| Artifact | Where | What breaks if it drifts |
|---|---|---|
| Plugin manifest | `<plugin>/.claude-plugin/plugin.json` | Plugin does not load |
| Marketplace entry | `.claude-plugin/marketplace.json` | Plugin is not installable |
| README section + structure tree | `README.md` | Users cannot find or install it |
| `version` in plugin.json | same manifest | **No bump → no cache refresh; users keep running the old copy** |

The plugin / marketplace spec itself follows the official Claude Code documentation.
Consult the docs (`ctx7 docs /websites/code_claude`) rather than inferring conventions
from neighbouring plugins — the neighbours may be stale.

## Writing the components

The four artifacts above are bookkeeping; what goes *inside* a skill is a separate
craft. Read [WRITING.md](WRITING.md) whenever you write or revise a skill's
`description` or body, or edit `CLAUDE.md`. It carries the judgment: how a description's
wording decides whether the skill fires, when a skill should be user-invoked instead
(`disable-model-invocation: true`) and pay no context load at all, what belongs in a
sibling file rather than in `SKILL.md`, and which sentences are no-ops to delete.

For the mechanics — frontmatter fields, directory layout, eval tooling — use
`plugin-dev:skill-development` and `skill-creator` instead.

## Adding a plugin

1. Create `<plugin>/.claude-plugin/plugin.json`. Copy the field set from an existing
   manifest (`name`, `description`, `version`, `author`, `keywords`, `homepage`,
   `license`); `homepage` points at `.../tree/main/<plugin>`. Start at `0.1.0`.
2. Add the components — `skills/`, `commands/`, `agents/`, `scripts/`. Auto-discovery
   finds them by directory; no manifest wiring needed.
3. Append an entry to `.claude-plugin/marketplace.json` `plugins[]`:
   `{"name", "source": "./<plugin>", "description"}`. Keep `description` in sync with
   the manifest's — they are read in different places and users compare them.
4. Add a `### <Plugin>` section to README.md under **Available Plugins** (what each
   component does, plus the `/plugin install <name>` block) **and** a row to the
   structure tree under **Plugin Development**.

## Modifying a plugin

Edit the components, then check the same four artifacts. Specifically:

- Component renamed, added, or deleted → update the README section and the structure
  tree row.
- Behaviour or scope changed → update both descriptions (manifest + marketplace entry).
- Version: `.githooks/pre-push` auto-bumps the **patch** once per push for any plugin
  with content changes in the pushed range — a stack of commits costs one bump, not one
  per commit. It skips a plugin whose version already changed in that range, so a manual
  minor/major bump wins — edit the version and commit the manifest yourself.

The bump is amended into the tip commit, so the first `git push` aborts with
`Run 'git push' again`; the second succeeds. The hook refuses to bump when the index or
the manifest is dirty, to avoid amending work in progress.

The hook only runs when the clone is wired up: `git config core.hooksPath .githooks`.
Verify this before trusting auto-bump.

## Removing a plugin

Removal touches all four: `git rm -r <plugin>`, drop the `plugins[]` entry, drop the
README section, drop the structure-tree row. A plugin whose last skill is deleted is a
plugin with nothing left — remove the directory rather than leaving an empty shell in
the marketplace.

## Cross-marketplace dependencies

`allowCrossMarketplaceDependenciesOn` at the marketplace root lists the outside
marketplaces a plugin here may depend on. Adding a dependency on a new marketplace
means adding it there first, otherwise the dependency does not resolve.

## Before finishing

Read back what you touched and confirm each holds:

- Every `*/.claude-plugin/plugin.json` has a `plugins[]` entry, and vice versa. The
  manifest `name` is the invocation namespace and may deliberately differ from the
  directory and the entry name (`context-flow` → `cf:`, `obsidian-workspace` → `obw:`)
  — do not "fix" those to match.
- Every `plugins[]` entry has a README section and a structure-tree row.
- Skill `name` in frontmatter is lowercase-hyphen and matches its directory — for a
  plugin skill, that `name` becomes the last segment of `/<plugin>:<name>`, so spaces
  or capitals produce a command nobody can type.
- Any `description` you touched holds one trigger per branch, with synonyms collapsed,
  and the invocation choice was made rather than defaulted — see
  [WRITING.md](WRITING.md).
