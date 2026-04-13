---
name: git-to-jj
description: >-
  This skill should be used when the user is in a Jujutsu (jj) repository and uses
  Git-specific terminology — such as "commit", "branch", "checkout", "stash",
  "cherry-pick", "rebase -i", "reset", "push", "pull", "merge", "add", "stage",
  "log", "diff", "amend", "revert", "tag", "fetch", or "clone". Focuses on explaining
  conceptual differences between Git and jj, not just command mapping. Translates Git
  mental models into correct jj equivalents. Do NOT use when the user is already using
  jj terminology correctly — use jj-workflow instead. Detects .jj directory presence
  combined with git vocabulary.
---

# git-to-jj — Git Mental Model Translation

When a user thinks in Git terminology inside a jj repository, translate their intent into the correct jj workflow.

## When to Use

Use when ALL of these conditions are met:
1. A `.jj` directory exists in the project root (verify with `ls -d .jj 2>/dev/null`)
2. The user uses Git-specific terminology (commit, branch, checkout, stash, etc.)
3. The user intends to perform a VCS operation (not just discussing Git conceptually)

Do NOT use when:
- There is no `.jj` directory (use actual git commands)
- The user explicitly asks for git commands to run in a git-only repo
- The user is already using jj terminology correctly
- The user is discussing git concepts theoretically (not trying to do an operation)

## Translation Table

### Core Operations

| Git Command / Concept | jj Equivalent | Key Difference |
|---|---|---|
| `git add` + `git commit` | `jj describe -m "msg"` | jj auto-tracks all files. No staging area. The working copy IS the change — just describe it. |
| `git commit --amend` | `jj describe -m "new msg"` | In jj, the working copy is always being amended. Just re-describe. |
| `git add -p` / `git add <file>` | `jj split` | Use split to selectively choose what goes into the current change |

### Branching and Navigation

| Git Command / Concept | jj Equivalent | Key Difference |
|---|---|---|
| `git branch <name>` | `jj bookmark set <name>` | Bookmarks are jj's branches. They're just labels on changes. |
| `git branch -d <name>` | `jj bookmark delete <name>` | |
| `git checkout <branch>` | `jj new <bookmark>` or `jj edit <rev>` | `jj new` starts fresh work on top; `jj edit` modifies existing change |
| `git checkout -b <name>` | `jj new` then `jj bookmark set <name>` | Create change, then label it |
| `git switch <branch>` | `jj new <bookmark>` or `jj edit <rev>` | Same as checkout |

### Stashing and Temporary Work

| Git Command / Concept | jj Equivalent | Key Difference |
|---|---|---|
| `git stash` | `jj new` | Just start a new change! Your work stays in the parent change. No special stash mechanism needed. |
| `git stash pop` | `jj squash --from <stashed-change>` | Squash the "stashed" work into current change |
| `git stash list` | `jj log` | All changes are visible in the log — no hidden stash stack |

### History Manipulation

| Git Command / Concept | jj Equivalent | Key Difference |
|---|---|---|
| `git cherry-pick <commit>` | `jj duplicate <rev>` | Creates a copy of the change |
| `git rebase -i` (squash) | `jj squash` | Squash current into parent |
| `git rebase -i` (reorder) | `jj rebase -r <rev> -d <dest>` | Move changes around freely |
| `git rebase -i` (edit) | `jj edit <rev>` | Go back and modify any change |
| `git rebase -i` (split) | `jj split` | Split a change into pieces |
| `git rebase <branch>` | `jj rebase -d <rev>` | Rebase onto a destination |
| `git reset --soft HEAD~1` | `jj squash --from @ --into @-` or just `jj edit @-` | Move work back to parent |
| `git reset --hard` | `jj restore` | Discard working copy changes |
| `git revert <commit>` | `jj backout -r <rev>` | Create an inverse change |

### Remote Operations

| Git Command / Concept | jj Equivalent | Key Difference |
|---|---|---|
| `git push` | `jj git push` | Only pushes bookmarked changes |
| `git pull` | `jj git fetch` + `jj rebase -d 'trunk()'` | Fetch and rebase are separate steps |
| `git fetch` | `jj git fetch --all-remotes` | |
| `git clone` | `jj git clone <url>` | Creates colocated repo by default |

### Viewing History

| Git Command / Concept | jj Equivalent | Key Difference |
|---|---|---|
| `git log` | `jj log` | Shows change graph with revisions |
| `git log --oneline` | `jj log --limit N` | |
| `git diff` | `jj diff` | Shows current change diff |
| `git diff --staged` | `jj diff` | No staging area — `jj diff` shows all |
| `git show <commit>` | `jj diff -r <rev>` | Show diff for any change |
| `git blame` | `jj file annotate <path>` | Line-by-line annotation |

## Execution Pattern

When a user uses Git terminology in a jj repo:

1. **Detect context**: Verify `.jj` exists. Note if colocated (`.git` also exists).
2. **Acknowledge the Git terminology**: Briefly explain the jj equivalent concept.
   - Example: "In jj, there's no staging area — your working copy IS the change. Instead of `git add + commit`, you just `jj describe` to add a message."
3. **Show the jj command**: Present the exact command that achieves the user's intent.
4. **Execute**: Run the jj command.
5. **Show result**: Display updated state.

## Key Conceptual Differences to Explain

When translating, highlight these fundamental differences:

### No Staging Area
Git's `add` → `commit` workflow doesn't exist in jj. All file changes are automatically part of the current change. Just describe when ready.

### Working Copy is a Change
In Git, uncommitted work is "dirty state." In jj, the working copy IS a first-class change that's always being recorded. `jj describe` names it; `jj new` starts the next one.

### Changes vs Commits
Git has immutable commits. jj has mutable changes that can be freely edited, squashed, split, and rebased without special "interactive" modes.

### Bookmarks vs Branches
Git branches are pointers that advance with commits. jj bookmarks are labels you explicitly set on changes. They don't auto-advance.

### No Detached HEAD
In jj, you're always working on a change. There's no "detached HEAD" state. `jj new <any-rev>` just works.
