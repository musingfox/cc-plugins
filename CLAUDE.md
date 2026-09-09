# CLAUDE.md

Claude Code Plugin Marketplace — multiple independent plugins. Plugin list lives in `.claude-plugin/marketplace.json`.

Plugin / marketplace spec, component structure, and frontmatter fields follow the official Claude Code documentation — do not hard-code conventions here; consult the docs when in doubt.

## Adding / Modifying a Plugin

1. Follow the official plugin structure; write `.claude-plugin/plugin.json`.
2. Add entry to root `.claude-plugin/marketplace.json`.
3. Keep root `README.md` in sync (plugin listing, install commands).

## Version Management

Claude Code uses `plugin.json` `version` to detect updates — **no bump → no cache refresh**.

`.githooks/pre-push` auto-bumps the patch version once per push for every plugin with
content changes in the pushed range. Setup once per clone:

```bash
git config core.hooksPath .githooks
```

The bump is amended into the tip commit, which git cannot push in the same run — the
hook aborts and asks for a second `git push`. That one goes through.

Manual minor/major bump: edit `plugin.json` version and commit it — the hook skips any
plugin whose version already changed in the pushed range.

A slash command runs the **installed** copy, not this working tree, so a plugin edited here
is not what `/<plugin>:<command>` loads in the session that edited it. To exercise the change
now, drive the workflow from the working-tree file by hand; to exercise it as a command, push,
reinstall, and start a fresh session.
