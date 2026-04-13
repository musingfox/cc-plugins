---
description: "Obsidian PM — manage tasks, documents, and ADRs in your Obsidian vault"
argument-hint: "[action] [args]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent"]
---

# /obm — Obsidian Project Management

Load and execute the `obsidian-pm` skill from this plugin. All operations go through the Obsidian CLI against the configured vault.

## Usage

```
/obm                          # Show project status / active tasks
/obm list                     # List active tasks
/obm create task <name>       # Create a new task
/obm create doc <name>        # Create a new document
/obm create adr <title>       # Create a new ADR
/obm done <task-name>         # Mark task as done and archive
/obm dashboard                # Generate or refresh dashboard
/obm search <keyword>         # Search vault content
```

## Execution

1. Read `.obsidian-pm.yaml` from the project root to get `vault` and `project` values.
2. If no config exists, guide the user through setup (list vaults, pick one, create config).
3. Parse the user's argument to determine the operation.
4. If no argument is provided, default to showing a summary of active tasks (in-progress first, then todo, then blocked).
5. If the action is not recognized, show the usage examples above and ask the user to clarify.
6. Execute the operation following the `obsidian-pm` skill instructions.
