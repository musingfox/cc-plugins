# CLAUDE.md

Claude Code Plugin Marketplace — multiple independent plugins. Plugin list lives in `.claude-plugin/marketplace.json`.

Plugin / marketplace spec, component structure, and frontmatter fields follow the official Claude Code documentation — do not hard-code conventions here; consult the docs when in doubt.

## Adding / Modifying a Plugin

1. Follow the official plugin structure; write `.claude-plugin/plugin.json`.
2. Add entry to root `.claude-plugin/marketplace.json`.
3. Keep root `README.md` in sync (plugin listing, install commands).

## Version Management

Claude Code uses `plugin.json` `version` to detect updates — **no bump → no cache refresh**.

`.githooks/pre-commit` auto-bumps patch version for plugins with staged changes. Setup once per clone:

```bash
git config core.hooksPath .githooks
```

Manual minor/major bump: edit `plugin.json` version and stage it — hook skips auto-bump.
