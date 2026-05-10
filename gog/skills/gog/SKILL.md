---
name: gog
description: >-
  Use the `gog` CLI to operate Google Workspace — Gmail (read/search/send/labels/drafts),
  Calendar (events/RSVP/freebusy/focus-time/out-of-office), and Drive (list/search/upload/
  download/share/move). Triggers on any Gmail, inbox, email, calendar, agenda, meeting,
  schedule, RSVP, Drive, Google Doc/Sheet/Slides, file share, or upload/download request.
---

# Google Workspace Operations via gog CLI

Single entry point for Gmail, Calendar, and Drive. Load only the section you need.

## Prerequisites (all services)

- Verify auth before commands. If a call returns auth error, instruct user to run
  `gog auth add <email>` (add `--services <gmail|calendar|drive>` if scoped).

## Universal Principles

- **`--json`** when parsing programmatically; human-readable when displaying to user.
- **`--dry-run`** before any send / create / update / delete / share / upload-replace.
  Preview, get user confirmation, then execute without `--dry-run`.
- **`--no-input`** to prevent blocking interactive prompts.
- Default `--max=10` (or `--max=20` for Drive listings) to avoid output flood.
- Resolve IDs (message / thread / event / file) via search/list before operating —
  do not guess.

## Per-service Command Reference

Read the relevant reference file for full command details:

- **Gmail** — search, read, send, reply, drafts, labels, batch ops, attachments.
  → `references/gmail.md`
- **Calendar** — list/search events, create/update/delete, RSVP, freebusy, conflicts,
  focus-time, out-of-office, working-location.
  → `references/calendar.md`
- **Drive** — list/search files, get metadata, download (with export formats),
  upload, copy, mkdir, move, rename, delete, share/permissions, comments.
  → `references/drive.md`

## Cross-cutting Safety Rules

- Never **send / delete / share / overwrite** without `--dry-run` preview + confirmation.
- For Calendar: default `--send-updates=none`; ask before notifying attendees.
- For Calendar recurring events: clarify scope (`single` / `future` / `all`) before update.
- For Drive: `--permanent` delete is irreversible — require explicit user confirmation.
- For Gmail: be mindful of sensitive content when displaying message bodies.
