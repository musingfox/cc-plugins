# Gmail Operations via gog CLI

Aliases: `gog gmail`, `gog mail`, `gog email`.

## Verify auth

```bash
gog gmail labels list
```

If auth fails: `gog auth add <email>` (or `--services gmail`).

## Searching Email

Search threads with Gmail query syntax:

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

Search individual messages instead of threads:

```bash
gog gmail messages search "<query>" --max=10
```

Key flags: `--max=N`, `--all` (paginate fully), `--page=<token>`, `--fail-empty`
(exit 3 when empty), `--timezone=<IANA>`, `--json` for structured output.

## Reading Messages

```bash
gog gmail get <messageId>
gog gmail get <messageId> --format=metadata --headers=From,To,Subject,Date
```

Formats: `full` (default), `metadata`, `raw` (RFC 2822).

## Reading Threads

```bash
gog gmail thread get <threadId>
gog gmail thread attachments <threadId>
gog gmail attachment <messageId> <attachmentId> --out=/tmp/
```

## Sending Email

Always preview with `--dry-run`:

```bash
gog gmail send --to="recipient@example.com" --subject="Subject" --body="Body" --dry-run
```

Key flags:
- `--to`, `--cc`, `--bcc` — recipients (comma-separated)
- `--subject`, `--body`, `--body-html`, `--body-file` (`-` for stdin)
- `--attach=path` — repeatable
- `--reply-to-message-id=<id>` / `--thread-id=<id>` — reply targets
- `--reply-all` — auto-populate recipients (needs reply target)
- `--quote` — include quoted original

## Replying

```bash
gog gmail send --reply-to-message-id=<messageId> --body="..." --reply-all --quote --dry-run
```

## Drafts

```bash
gog gmail drafts list
gog gmail drafts get <draftId>
gog gmail drafts create --to="..." --subject="..." --body="..."
gog gmail drafts update <draftId> --body="..."
gog gmail drafts send <draftId>
gog gmail drafts delete <draftId>
```

## Labels

```bash
gog gmail labels list
gog gmail labels get <labelIdOrName>
gog gmail labels create <name>
gog gmail labels delete <labelIdOrName>
gog gmail labels modify <threadId> --add=INBOX --remove=UNREAD
```

## Batch Operations

```bash
gog gmail batch modify <messageId1> <messageId2> --add=STARRED
gog gmail batch delete <messageId1> <messageId2> --dry-run    # destructive
```

## Utilities

```bash
gog gmail url <threadId>
```

## Workflows

**Search-Read-Reply**:
1. `gog gmail search "from:alice subject:project" --json --no-input --max=5`
2. Extract thread/message ID from JSON
3. `gog gmail thread get <threadId>`
4. `gog gmail send --reply-to-message-id=<messageId> --body="..." --reply-all --quote --dry-run`
5. After confirm, execute without `--dry-run`

**Label-Based Triage**:
1. `gog gmail labels list`
2. `gog gmail search "is:unread" --max=20`
3. `gog gmail labels modify <threadId> --add=<label> --remove=UNREAD`
