---
description: "Create a long-form note in your Obsidian vault"
argument-hint: "<title> [--folder <path>] [--tag <tag>] [content...]"
allowed-tools: ["Agent"]
---

# /obw:note — Create a Long-Form Note

Delegate to the `obsidian-operator` agent so vault I/O stays out of the main context.

Invoke `Agent` with:
- `subagent_type`: `obsidian-operator`
- `description`: `Create long-form note`
- `prompt`: `mode=note\nargs=$ARGUMENTS`

Relay the agent's summary verbatim.

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
