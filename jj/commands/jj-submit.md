---
name: jj-submit
description: Submit workflow — describe current change, start new change, optionally set bookmark and push
argument-hint: "<commit message>"
allowed-tools:
  - Bash
  - AskUserQuestion
---

# jj-submit — Submit Workflow

Complete the current change with a description and push to remote. This is the jj equivalent of `git commit + push`.

## Environment Detection

```bash
# Verify jj repo
if [ ! -d ".jj" ] && ! jj root 2>/dev/null; then
  echo "NOT_JJ_REPO"
fi

# Check colocated
if [ -d ".git" ] || git rev-parse --git-dir 2>/dev/null; then
  echo "COLOCATED"
else
  echo "NATIVE_JJ"
fi
```

## Workflow

### Step 1: Show Current Diff

```bash
jj diff
```

If the diff is empty, inform the user there are no changes to submit and stop.

Present a brief summary of what changed (files modified/added/removed, rough scope).

### Step 2: Describe the Change

If the user provided a message argument, use it:
```bash
jj describe -m "<user message>"
```

If no message was provided, ask the user:
- Use AskUserQuestion with a text input asking for a commit message
- Suggest a message based on the diff content

After describing, confirm:
```bash
jj log --limit 1
```

### Step 3: Start a New Change

```bash
jj new
```

This moves the working copy to a fresh empty change, leaving the described change as the parent.

### Step 4: Bookmark Management (if needed)

Check if the previous change (now `@-`) already has a bookmark:
```bash
jj bookmark list --revisions @-
```

If no bookmark exists and this is colocated mode:
- Ask the user if they want to set a bookmark (needed for pushing)
- Suggest a bookmark name based on the change description
- If yes: `jj bookmark set <name> -r @-`

### Step 5: Push (Colocated Only)

If colocated and the change has a bookmark:
```bash
jj git push
```

Report push result. If push fails (e.g., non-fast-forward), explain and suggest `jj-sync` first.

If native jj (no git), skip push and inform the user.

## Output Summary

```
## Submit Complete

**Change**: [change ID]
**Description**: [message]
**Bookmark**: [bookmark name, or "none"]
**Pushed**: [Yes/No/N/A]
**Working copy**: [new empty change ID]
```

## Error Handling

- **Empty working copy**: Inform user, suggest `jj status` to check
- **Push rejected**: Suggest running `/jj-sync` first to rebase onto latest trunk
- **Conflicts in change**: Warn user and suggest resolving before submitting
