---
description: "Obsidian Workspace PM — manage tasks, documents, and ADRs in your Obsidian vault"
argument-hint: "[action] [args]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task"]
---

# /obw:pm — Obsidian Project Management

Load and execute the `pm` skill from this plugin. All operations go through the Obsidian CLI against the configured vault.

## Usage

```
/obw:pm                          # Show project status / active tasks
/obw:pm list                     # List active tasks
/obw:pm create task <name>       # Create a new task
/obw:pm create doc <name>        # Create a new document
/obw:pm create adr <title>       # Create a new ADR
/obw:pm done <task-name>         # Mark task as done and archive
/obw:pm dashboard                # Generate or refresh dashboard
/obw:pm search <keyword>         # Search vault content
```

## Execution

1. Read `.obsidian.yaml` from the project root to get `vault` and `project` values (under the `pm` section).
2. If no config exists, suggest running `/obw:init` to set up the config file.
3. Parse the user's argument to determine the operation.
4. If no argument is provided, default to showing a summary of active tasks (in-progress first, then todo, then blocked).
5. If the action is not recognized, show the usage examples above and ask the user to clarify.
6. Execute the operation following the `pm` skill instructions.
