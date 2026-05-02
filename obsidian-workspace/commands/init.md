---
description: "Interactively create .obsidian.yaml and install starter templates for this project"
argument-hint: ""
allowed-tools: ["Agent"]
---

# /obw:init — Initialize Obsidian Workspace

Delegate to the `obsidian-operator` agent. The agent runs the interactive setup (vault picker, config questions, template install) in its own context, then returns a one-screen summary.

Invoke `Agent` with:
- `subagent_type`: `obsidian-operator`
- `description`: `Initialize obw config`
- `prompt`: `mode=init\nargs=$ARGUMENTS`

Relay the agent's summary verbatim. The agent uses `AskUserQuestion` for the interactive choices, so the user sees the prompts directly.
