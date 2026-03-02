---
name: jj-status
description: Rich Jujutsu status overview — working copy, recent changes, bookmarks, and conflict detection
allowed-tools:
  - Bash
---

# jj-status — Rich Status Overview

Display a comprehensive Jujutsu repository status in a single view.

## Environment Detection

First, detect the repository type:

```bash
# Check if we're in a jj repo
if [ ! -d ".jj" ] && ! jj root 2>/dev/null; then
  echo "NOT_JJ_REPO"
fi

# Check if colocated (jj + git)
if [ -d ".git" ] || git rev-parse --git-dir 2>/dev/null; then
  echo "COLOCATED"
else
  echo "NATIVE_JJ"
fi
```

If NOT a jj repo, inform the user and stop.

## Data Collection

Run these commands and collect output:

### 1. Working Copy Status
```bash
jj status
```

### 2. Recent Changes (Log)
```bash
jj log --limit 10
```

### 3. Bookmark List
```bash
jj bookmark list
```

### 4. Conflict Detection
```bash
jj log --revisions "conflict()"
```

## Output Format

Present the collected information in a structured summary:

```
## Repository Status

**Mode**: [Colocated (jj + git) | Native jj]
**Working copy**: [change ID and description]

### Recent Changes
[formatted log output — highlight the working copy change]

### Bookmarks
[bookmark list with tracking status]

### Conflicts
[list of conflicted changes, or "No conflicts detected"]
```

## Colocated-Specific Info

If colocated, also show:
- Git branch that corresponds to the current bookmark (if any)
- Whether there are unpushed bookmarks: `jj git push --dry-run` (capture output, don't actually push)

## Error Handling

- If `jj` is not installed, inform the user: "jj (Jujutsu) is not installed. Install via: `cargo install jj-cli` or `brew install jj`"
- If any sub-command fails, show what succeeded and note the failure
