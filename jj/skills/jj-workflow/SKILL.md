---
name: jj-workflow
description: >-
  This skill should be used when the user is in a Jujutsu (jj) repository and describes
  VCS operations using jj terminology or neutral language — such as splitting a change,
  squashing changes together, rebasing, creating new changes, editing past changes,
  setting bookmarks, resolving conflicts, duplicating changes, backing out changes,
  or managing workspaces. Assumes the user is already thinking in jj terms.
  Do NOT use when the user uses Git-specific vocabulary (commit, branch, checkout, stash) —
  use git-to-jj instead for translation. Detects .jj directory presence to confirm jj context.
---

# jj-workflow — Natural Language to jj Operations

Translate natural language VCS requests into correct `jj` commands when working in a Jujutsu repository.

## When to Use

Use when ALL of these conditions are met:
1. A `.jj` directory exists in the project root (verify with `ls -d .jj 2>/dev/null`)
2. The user describes a version control operation in natural language
3. The operation maps to one or more `jj` commands

Do NOT use when:
- There is no `.jj` directory (this is not a jj repo)
- The user is explicitly asking for git commands in a non-jj context
- The user already typed the exact `jj` command they want to run

## Operation Reference

### Creating and Navigating Changes

| User Intent | jj Command | Notes |
|---|---|---|
| Start new work / new change | `jj new` | Creates empty change on top of current |
| New change from specific parent | `jj new <rev>` | Branch from a specific revision |
| New change with multiple parents | `jj new <rev1> <rev2>` | Creates a merge change |
| Go back and edit a past change | `jj edit <rev>` | Moves working copy to that change |
| See what I'm working on | `jj status` | Shows working copy status |

### Describing and Modifying Changes

| User Intent | jj Command | Notes |
|---|---|---|
| Add/update commit message | `jj describe -m "message"` | Describes current working copy |
| Describe a different change | `jj describe <rev> -m "msg"` | Describe any change |
| Combine with parent | `jj squash` | Squash current into parent |
| Squash specific change into another | `jj squash --from <src> --into <dst>` | Flexible squash |
| Split change into two | `jj split` | Interactive split |
| Split specific files out | `jj split <paths>` | Split by file |
| Discard / throw away a change | `jj abandon <rev>` | Remove change from history |

### Rebasing and Reorganizing

| User Intent | jj Command | Notes |
|---|---|---|
| Move change to different parent | `jj rebase -r <rev> -d <dest>` | Rebase single change |
| Move change and its descendants | `jj rebase -s <rev> -d <dest>` | Rebase subtree |
| Move change and reparent children | `jj rebase -b <rev> -d <dest>` | Rebase branch |
| Put change on top of trunk/main | `jj rebase -r <rev> -d 'trunk()'` | Common rebase target |

### Bookmarks (Branches)

| User Intent | jj Command | Notes |
|---|---|---|
| Create / move a bookmark | `jj bookmark set <name> -r <rev>` | Set bookmark at revision |
| List bookmarks | `jj bookmark list` | Show all bookmarks |
| Delete a bookmark | `jj bookmark delete <name>` | Remove bookmark |
| Track remote bookmark | `jj bookmark track <name>@<remote>` | Start tracking |

### Collaboration (Colocated)

| User Intent | jj Command | Notes |
|---|---|---|
| Push changes | `jj git push` | Push bookmarked changes |
| Fetch latest | `jj git fetch --all-remotes` | Fetch from all remotes |
| Import git refs | `jj git import` | Sync git state into jj |
| Export jj to git | `jj git export` | Sync jj state to git |

### Other Operations

| User Intent | jj Command | Notes |
|---|---|---|
| Copy a change | `jj duplicate <rev>` | Duplicate without moving |
| Reverse a change | `jj backout -r <rev>` | Create inverse change |
| Resolve conflicts | `jj resolve` | Launch merge tool |
| Show diff | `jj diff` | Current change diff |
| Show diff of specific change | `jj diff -r <rev>` | Diff for any change |
| Restore file from another change | `jj restore --from <rev> <path>` | Restore specific file |
| Create workspace | `jj workspace add <path>` | Multiple working copies |
| Undo last operation | `jj op undo` | Undo last jj operation |

## Execution Pattern

When handling a natural language VCS request:

1. **Detect context**: Verify `.jj` exists. Check if colocated (`.git` also exists).
2. **Show current state**: Run `jj log --limit 5` to understand the current change graph.
3. **Analyze intent**: Map the user's natural language to the appropriate jj command(s).
4. **Explain before executing**: Tell the user what command(s) will run and why.
5. **Execute**: Run the command(s).
6. **Show result**: Display the updated state with `jj log --limit 5` or `jj status`.

## Multi-Step Operations

Some requests require multiple commands. Common patterns:

**"Move this change before that one":**
1. `jj rebase -r <this> -d <that-parent>`
2. `jj rebase -r <that> -d <this>`

**"Start a new feature from main":**
1. `jj new 'trunk()'`
2. `jj bookmark set feature-name`

**"Clean up and submit":**
1. `jj squash` (combine with parent if needed)
2. `jj describe -m "message"`
3. `jj bookmark set <name> -r @`
4. `jj git push` (if colocated)

## Revision Syntax Quick Reference

Help users with jj's revision syntax when needed:
- `@` — current working copy
- `@-` — parent of working copy
- `trunk()` — main/master bookmark
- `mine()` — changes authored by current user
- `empty()` — changes with no diff
- `conflict()` — changes with conflicts
- `<rev>-` — parent of revision
- `<rev>+` — children of revision
- `<rev1>::<rev2>` — range between revisions
