# CLAUDE.md

Claude Code Plugin Marketplace — multiple independent plugins. Plugin list lives in `.claude-plugin/marketplace.json`.

Plugin / marketplace spec, component structure, and frontmatter fields follow the official Claude Code documentation — do not hard-code conventions here; consult the docs when in doubt.

## Adding / Modifying a Plugin

1. Follow the official plugin structure; write `.claude-plugin/plugin.json`.
2. Add entry to root `.claude-plugin/marketplace.json`.
3. Keep root `README.md` in sync (plugin listing, install commands).

The hooks below live in `.githooks/`. Setup once per clone:

```bash
git config core.hooksPath .githooks
```

## Commit Messages

`.githooks/commit-msg` enforces Conventional Commits on the subject:
`<type>[(scope)][!]: <description>`. **The plugin name is a scope, not a type** —
`feat(spiral):`, not `spiral:`. `fixup!` / `squash!` and git's own merge and revert
subjects pass through. Commits made before the hook do not conform; leave them alone.

## Version Management

Claude Code uses `plugin.json` `version` to detect updates — **no bump → no cache refresh**.

`.githooks/pre-commit` auto-bumps the patch version for every plugin whose content is
in the commit, once per unpushed batch: it compares against the last pushed state, so a
stack of commits before a push costs one bump per plugin, and `--amend` / `fixup!` never
bump twice. The bump lands in the same commit, so one `git push` ships it.

Manual minor/major bump: edit `plugin.json` version and commit it — the hook skips any
plugin whose version already differs from the pushed one.

`.githooks/pre-push` only guards: it refuses a push where a plugin's content changed but
its version did not (a commit made with `--no-verify` or from a clone without
`core.hooksPath`). `.githooks/post-commit` re-stages the bumped manifest after a
`git commit <pathspec>`, which otherwise leaves the real index on the old version.

A slash command runs the **installed** copy, not this working tree, so a plugin edited here
is not what `/<plugin>:<command>` loads in the session that edited it. To exercise the change
now, drive the workflow from the working-tree file by hand; to exercise it as a command, push,
reinstall, and start a fresh session.
