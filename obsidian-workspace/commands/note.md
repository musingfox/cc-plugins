---
description: "Create a long-form note in your Obsidian vault"
argument-hint: "<title> [--folder <path>] [--tag <tag>] [content...]"
allowed-tools: ["Bash", "Read", "AskUserQuestion"]
---

# /obw:note — Create a Long-Form Note

Trigger the `note` skill. Creates a new note at the configured default folder (or `--folder` override) using the chosen filename strategy.

## Usage

```
/obw:note API redesign proposal
/obw:note Weekend reading list --folder References
/obw:note Retro 2026 Q1 --folder Retros --tag retro --tag quarterly
```

Flags:
- `--folder <path>` — vault-relative folder (no leading `/` or `..`)
- `--tag <tag>` — repeatable; added to frontmatter `tags`
- Trailing text after flags becomes the initial body.
