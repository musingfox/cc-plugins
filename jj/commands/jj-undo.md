---
name: jj-undo
description: Undo operations with preview — show recent operation log and let user choose what to undo or restore
allowed-tools:
  - Bash
  - AskUserQuestion
---

# jj-undo — Undo with Preview

Show recent operations and allow the user to undo or restore to a specific point.

## Environment Detection

```bash
if [ ! -d ".jj" ] && ! jj root 2>/dev/null; then
  echo "NOT_JJ_REPO"
fi
```

If NOT a jj repo, inform the user and stop.

## Workflow

### Step 1: Show Operation Log

```bash
jj op log --limit 10
```

Present the operations in a readable format, numbering them for easy selection:

```
## Recent Operations

1. [op ID] — [timestamp] — [description]
2. [op ID] — [timestamp] — [description]
...
```

### Step 2: Ask User What to Do

Use AskUserQuestion:

```
What would you like to do?
```

Options:
- **"Undo last operation"** — Undo only the most recent operation (`jj op undo`)
- **"Restore to a specific point"** — Go back to a specific operation state (`jj op restore`)
- **"Cancel"** — Do nothing

### Step 3A: Undo Last Operation

If "Undo last operation":
```bash
jj op undo
```

Show what was undone and the new state:
```bash
jj status
jj log --limit 3
```

### Step 3B: Restore to Specific Point

If "Restore to a specific point":
1. Ask user to specify which operation number (from the list shown)
2. Show what will change by comparing current state to that operation
3. Confirm with user before proceeding
4. Execute: `jj op restore <operation-id>`
5. Show new state

### Step 4: Report

```
## Undo Complete

**Action**: [Undo last | Restore to operation N]
**Operation**: [description of what was undone/restored]
**Current state**: [brief status after undo]
```

## Important Notes

- `jj op undo` undoes ONLY the last operation (reversible, safe)
- `jj op restore` resets the entire repo state to that point (more destructive)
- Always show the current state after any undo operation
- If the user is unsure, recommend `jj op undo` as the safer option
