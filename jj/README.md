# jj — Jujutsu VCS Plugin for Claude Code

Workflow commands, natural language operations, and Git-to-jj mental model translation for [Jujutsu (jj)](https://github.com/martinvonz/jj).

Supports both **colocated** (jj + git) and **native jj** repositories with automatic detection.

## Installation

```bash
/plugin install jj
```

**Prerequisite**: `jj` must be installed (`cargo install jj-cli` or `brew install jj`).

## Commands

| Command | Description |
|---|---|
| `/jj-status` | Rich status overview — working copy, log, bookmarks, conflicts |
| `/jj-sync` | Sync workflow — fetch all remotes, rebase onto trunk, report conflicts |
| `/jj-submit [message]` | Submit workflow — describe, new, bookmark, push (like `git commit + push`) |
| `/jj-clean` | Clean up empty/abandoned changes with confirmation |
| `/jj-undo` | Undo with preview — browse operation log, undo or restore |

## Skills

### jj-workflow
Automatically triggered when you describe VCS operations in natural language inside a jj repo:
- "Split this change into two"
- "Move this change on top of main"
- "Squash the last two changes together"
- "Create a new change from trunk"

### git-to-jj
Automatically triggered when you use Git terminology inside a jj repo:
- "Commit these changes" → `jj describe`
- "Create a branch" → `jj bookmark set`
- "Cherry-pick that change" → `jj duplicate`
- "Stash my work" → `jj new`
- "Push to remote" → `jj git push`

## Colocated vs Native Detection

The plugin automatically detects the repository type:
- **Colocated** (`.jj` + `.git`): Full workflow including `jj git fetch/push`
- **Native jj** (`.jj` only): Local-only operations, push/fetch commands report no remote

## Key jj Concepts

| Git Concept | jj Equivalent |
|---|---|
| Staging area | None — all changes are auto-tracked |
| Commit | Change (mutable, editable) |
| Branch | Bookmark (explicit label) |
| Stash | Just `jj new` — work stays in parent |
| Interactive rebase | `jj squash` / `jj split` / `jj rebase` |
| Detached HEAD | Doesn't exist — always on a change |
