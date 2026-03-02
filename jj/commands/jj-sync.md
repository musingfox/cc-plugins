---
name: jj-sync
description: Sync workflow — fetch from all remotes, rebase onto trunk, and report conflicts
allowed-tools:
  - Bash
  - AskUserQuestion
---

# jj-sync — Sync Workflow

Fetch latest changes from remotes and rebase the working copy onto trunk.

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

If NOT a jj repo, inform the user and stop.

## Colocated Mode Workflow

### Step 1: Fetch from All Remotes
```bash
jj git fetch --all-remotes
```
Report what was fetched (new bookmarks, updated refs).

### Step 2: Rebase onto Trunk
```bash
jj rebase -d 'trunk()'
```
If the rebase has conflicts, report them clearly.

### Step 3: Conflict Summary
```bash
jj log --revisions "conflict()"
```
If conflicts exist, explain:
- Which changes have conflicts
- Suggest `jj resolve` or manual resolution
- Offer to show the conflicted files

### Step 4: Status Report
Show a summary:
```
## Sync Complete

**Fetched**: [remotes fetched from]
**Rebased onto**: [trunk change]
**Conflicts**: [count, or "None"]
```

## Native jj Mode

If native (no git):
1. Check if there are any remotes configured: `jj config get revsets.trunk`
2. If no remotes, inform user: "No git remotes detected. This repo appears to be native jj without remote configuration."
3. If remotes exist via other means, attempt the sync workflow.

## Error Handling

- **No network**: If fetch fails with network error, report and skip to local status
- **No trunk**: If `trunk()` revset fails, ask the user which revision to rebase onto
- **Divergent bookmarks**: Report divergent bookmarks and suggest resolution
