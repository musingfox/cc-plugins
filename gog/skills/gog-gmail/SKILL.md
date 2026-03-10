---
name: gog Gmail
description: >-
  This skill should be used when the user asks to "check email", "search email",
  "send email", "read mail", "find emails from", "reply to email", "forward email",
  "list labels", "create a draft", "send a draft", "download attachment",
  "manage email labels", "archive email", "delete email",
  or mentions Gmail, inbox, or email management operations. Provides guidance
  for using the `gog gmail` CLI to interact with Gmail.
---

# Gmail Operations via gog CLI

Interact with Gmail using the `gog` CLI tool (`gog gmail` or aliases `gog mail`, `gog email`).

## Prerequisites

Verify `gog` is available and authenticated before executing commands:

```bash
gog gmail labels list
```

If authentication fails, inform the user to run `gog auth add <email>` first.

## Core Principles

- **Always use `--json` when parsing output programmatically** (e.g., extracting message IDs, threading). Use human-readable output when displaying results directly to the user.
- **Use `--dry-run` before any send or destructive operation.** Run the command with `-n` first, show the user what will happen, then execute after confirmation.
- **Use `--no-input`** to prevent interactive prompts from blocking execution.

## Command Reference

### Searching Email

Search threads using Gmail query syntax:

```bash
gog gmail search "<query>" --max=10
```

Common query patterns:
- `from:user@example.com` — from a specific sender
- `to:user@example.com` — to a specific recipient
- `subject:meeting` — subject contains "meeting"
- `is:unread` — unread messages
- `is:starred` — starred messages
- `has:attachment` — messages with attachments
- `after:2026/01/01 before:2026/03/01` — date range
- `label:important` — by label
- `"exact phrase"` — exact phrase match
- Combine: `is:unread from:boss@company.com has:attachment`

To search individual messages instead of threads:

```bash
gog gmail messages search "<query>" --max=10
```

Key flags:
- `--max=N` — max results (default: 10)
- `--all` — fetch all pages
- `--page=<token>` — pagination token
- `--fail-empty` — exit with code 3 if no results
- `--timezone=<tz>` — output timezone (IANA name)

Use `--json` to get structured output with message IDs.

### Reading Messages

Get a specific message by ID:

```bash
gog gmail get <messageId>
gog gmail get <messageId> --format=metadata --headers=From,To,Subject,Date
```

Formats: `full` (default), `metadata` (headers only), `raw` (RFC 2822).

### Reading Threads

Get an entire conversation thread:

```bash
gog gmail thread get <threadId>
```

List attachments in a thread:

```bash
gog gmail thread attachments <threadId>
```

Download a specific attachment:

```bash
gog gmail attachment <messageId> <attachmentId> --out=/tmp/
```

### Sending Email

**Always preview with `--dry-run` first:**

```bash
gog gmail send --to="recipient@example.com" --subject="Subject" --body="Message body" --dry-run
```

After user confirms, execute without `--dry-run`:

```bash
gog gmail send --to="recipient@example.com" --subject="Subject" --body="Message body"
```

Key flags:
- `--to`, `--cc`, `--bcc` — recipients (comma-separated)
- `--subject` — subject line
- `--body` — plain text body
- `--body-html` — HTML body (optional, alongside or instead of --body)
- `--body-file` — read body from file (`-` for stdin)
- `--attach=path` — file attachment (repeatable)
- `--reply-to-message-id=<id>` — reply to a specific message
- `--thread-id=<id>` — reply within a thread
- `--reply-all` — auto-populate recipients from original (requires --reply-to-message-id or --thread-id)
- `--quote` — include quoted original message in reply

### Replying to Email

To reply to an email, combine `--reply-to-message-id` (or `--thread-id`) with send:

```bash
# Preview first
gog gmail send --reply-to-message-id=<messageId> --body="Reply text" --reply-all --quote --dry-run
# Then execute
gog gmail send --reply-to-message-id=<messageId> --body="Reply text" --reply-all --quote
```

### Draft Operations

```bash
gog gmail drafts list                          # List all drafts
gog gmail drafts get <draftId>                 # View draft details
gog gmail drafts create --to="..." --subject="..." --body="..."  # Create draft
gog gmail drafts update <draftId> --body="..."  # Update draft
gog gmail drafts send <draftId>                # Send a draft
gog gmail drafts delete <draftId>              # Delete a draft
```

### Label Management

```bash
gog gmail labels list                          # List all labels
gog gmail labels get <labelIdOrName>           # Get label details with counts
gog gmail labels create <name>                 # Create a new label
gog gmail labels delete <labelIdOrName>        # Delete a label
```

Apply or remove labels on threads:

```bash
gog gmail labels modify <threadId> --add=INBOX --remove=UNREAD
```

### Batch Operations

Modify labels on multiple messages:

```bash
gog gmail batch modify <messageId1> <messageId2> --add=STARRED
```

Permanently delete multiple messages (**destructive — use `--dry-run`**):

```bash
gog gmail batch delete <messageId1> <messageId2> --dry-run
```

### Useful Utilities

Get Gmail web URL for a thread:

```bash
gog gmail url <threadId>
```

## Workflow Patterns

### Search-Read-Reply

A typical email workflow:

1. Search for the email: `gog gmail search "from:alice subject:project" --json --no-input --max=5`
2. Extract thread/message ID from JSON output
3. Read the thread: `gog gmail thread get <threadId>`
4. Reply: `gog gmail send --reply-to-message-id=<messageId> --body="..." --reply-all --quote --dry-run`
5. After user confirms, execute without `--dry-run`

### Label-Based Triage

1. List labels: `gog gmail labels list`
2. Search unread: `gog gmail search "is:unread" --max=20`
3. Apply labels: `gog gmail labels modify <threadId> --add=<label> --remove=UNREAD`

## Safety Rules

- **Never send email without `--dry-run` preview and user confirmation.**
- **Never batch delete without `--dry-run` preview and user confirmation.**
- When searching, default to `--max=10` to avoid overwhelming output.
- When displaying email content, be mindful of sensitive information.
