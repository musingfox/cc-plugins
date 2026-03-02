---
name: jj-clean
description: Clean up empty and abandoned changes — list candidates and confirm before abandoning
allowed-tools:
  - Bash
  - AskUserQuestion
---

# jj-clean — Clean Up Empty Changes

Find and remove empty or obsolete changes to keep the repository tidy.

## Environment Detection

```bash
if [ ! -d ".jj" ] && ! jj root 2>/dev/null; then
  echo "NOT_JJ_REPO"
fi
```

If NOT a jj repo, inform the user and stop.

## Workflow

### Step 1: Find Candidates

Run these queries to find cleanup candidates:

**Empty changes (owned by user):**
```bash
jj log --revisions "empty() & mine() & ~heads(trunk())"
```

**Changes with no description:**
```bash
jj log --revisions "description(exact:'') & mine()"
```

### Step 2: Present Candidates

Show the candidates grouped:

```
## Cleanup Candidates

### Empty Changes
[list of empty changes with IDs and parents]

### Undescribed Changes
[list of changes with no description]

**Total**: [N] candidates found
```

If no candidates found, inform the user the repo is clean and stop.

### Step 3: Confirm with User

Use AskUserQuestion to ask:
- "Abandon all [N] empty changes?" with options:
  - "Yes, abandon all" — abandon all candidates
  - "Let me pick" — show each candidate individually for yes/no
  - "No, cancel" — abort

### Step 4: Execute Cleanup

For each confirmed change:
```bash
jj abandon <change-id>
```

**Important**: Never abandon the working copy (`@`) or changes that are ancestors of bookmarks pointing to remote-tracking branches.

### Step 5: Report

```
## Cleanup Complete

**Abandoned**: [N] changes
**Skipped**: [N] changes (if any were skipped)
```

## Safety Rules

- NEVER abandon changes that have bookmarks with remote tracking
- NEVER abandon the current working copy (`@`)
- NEVER abandon changes that are ancestors of non-empty changes
- If unsure about a change, skip it and report why
