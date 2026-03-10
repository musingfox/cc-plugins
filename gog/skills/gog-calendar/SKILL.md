---
name: gog Calendar
description: >-
  This skill should be used when the user asks to "check my calendar", "show my agenda",
  "schedule a meeting", "create an event", "list events", "what's on my calendar",
  "today's schedule", "find free time", "check conflicts", "RSVP to event", "delete event",
  "update event", "set focus time", "block time", "set out of office", "search calendar",
  or mentions Google Calendar operations. Provides guidance for using the `gog calendar`
  CLI to interact with Google Calendar.
---

# Calendar Operations via gog CLI

Interact with Google Calendar using the `gog` CLI tool (`gog calendar` or alias `gog cal`).

## Prerequisites

Verify `gog` is available and authenticated:

```bash
gog calendar calendars
```

If authentication fails, inform the user to run `gog auth add <email> --services calendar` first.

## Core Principles

- **Always use `--json` when parsing output programmatically** (e.g., extracting event IDs). Use human-readable output when displaying schedules to the user.
- **Use `--dry-run` before creating, updating, or deleting events.** Preview the action, then execute after user confirmation.
- **Use `--no-input`** to prevent interactive prompts.
- **Calendar ID defaults to `primary`** for most commands. Use `gog calendar calendars` to discover other calendar IDs.

## Command Reference

### Listing Events

```bash
gog calendar events                          # Next 10 events on primary calendar
gog calendar events --today                  # Today's events
gog calendar events --tomorrow               # Tomorrow's events
gog calendar events --week                   # This week's events
gog calendar events --days=7                 # Next 7 days
gog calendar events --from=2026-03-10 --to=2026-03-15  # Date range
gog calendar events --all                    # Events from ALL calendars
gog calendar events <calendarId>             # Events from a specific calendar
```

Key flags:
- `--today`, `--tomorrow`, `--week`, `--days=N` — convenient time shortcuts
- `--from`, `--to` — explicit date range (RFC3339, date, or relative: `today`, `tomorrow`, `monday`)
- `--query="text"` — free text search within listed events
- `--max=N` — max results (default: 10)
- `--all-pages` — fetch all pages
- `--all` — all calendars
- `--fields=summary,start,end` — select specific fields (with `--json`)
- `--weekday` — include day-of-week columns

### Searching Events

Full-text search across events:

```bash
gog calendar search "team standup"
gog calendar search "team standup" --from=today --to=friday --calendar=primary
```

### Getting Event Details

```bash
gog calendar event <calendarId> <eventId>
```

### Creating Events

**Always preview with `--dry-run` first:**

```bash
gog calendar create primary \
  --summary="Team Meeting" \
  --from="2026-03-11T14:00:00" \
  --to="2026-03-11T15:00:00" \
  --description="Weekly sync" \
  --location="Conference Room A" \
  --attendees="alice@example.com,bob@example.com" \
  --dry-run
```

After user confirms, execute without `--dry-run`.

Key flags:
- `--summary` — event title
- `--from`, `--to` — start/end time (RFC3339)
- `--all-day` — all-day event (use date-only in --from/--to)
- `--description` — event description
- `--location` — location
- `--attendees` — comma-separated emails
- `--with-meet` — create a Google Meet link
- `--rrule` — recurrence rule (e.g., `RRULE:FREQ=WEEKLY;BYDAY=MO`)
- `--reminder=popup:30m` — custom reminder (method:duration, repeatable)
- `--event-color=1` — color ID (1-11, use `gog calendar colors` to see options)
- `--visibility` — default, public, private, confidential
- `--transparency` — opaque (busy) or transparent (free). Aliases: `busy`, `free`
- `--send-updates=all|externalOnly|none` — notification mode (default: none)

### Updating Events

**Always preview with `--dry-run` first:**

```bash
gog calendar update primary <eventId> \
  --summary="Updated Title" \
  --from="2026-03-11T15:00:00" \
  --to="2026-03-11T16:00:00" \
  --dry-run
```

Additional update-specific flags:
- `--add-attendee="new@example.com"` — add attendees without replacing existing ones
- `--scope=single|future|all` — for recurring events (default: all)
- `--original-start=<time>` — required for `scope=single` or `scope=future`
- Set any flag to empty to clear it (e.g., `--description=""`)

### Deleting Events

**Always preview with `--dry-run` first:**

```bash
gog calendar delete primary <eventId> --dry-run
```

### Responding to Invitations (RSVP)

```bash
gog calendar respond primary <eventId> --status=accepted
gog calendar respond primary <eventId> --status=declined --comment="I have a conflict"
gog calendar respond primary <eventId> --status=tentative
```

Status options: `accepted`, `declined`, `tentative`, `needsAction`.

### Free/Busy and Conflicts

Check free/busy status:

```bash
gog calendar freebusy primary --from="2026-03-10T09:00:00" --to="2026-03-10T18:00:00"
gog calendar freebusy "alice@example.com,bob@example.com" --from=today --to=tomorrow
```

Find scheduling conflicts:

```bash
gog calendar conflicts --today
gog calendar conflicts --week
gog calendar conflicts --days=7 --calendars="primary,work@example.com"
```

### Special Event Types

Focus Time block:

```bash
gog calendar focus-time --from="2026-03-11T09:00:00" --to="2026-03-11T12:00:00"
```

Out of Office:

```bash
gog calendar out-of-office --from="2026-03-15" --to="2026-03-16"
```

Working Location:

```bash
gog calendar working-location --from="2026-03-11" --to="2026-03-11" --type=home
gog calendar working-location --from="2026-03-12" --to="2026-03-12" --type=office --working-office-label="HQ"
```

### Utilities

List all calendars:

```bash
gog calendar calendars
```

Show available event colors:

```bash
gog calendar colors
```

Propose a new meeting time (generates browser URL):

```bash
gog calendar propose-time primary <eventId>
```

## Workflow Patterns

### Schedule a Meeting

1. Check free/busy: `gog calendar freebusy "alice@example.com,bob@example.com" --from=monday --to=friday`
2. Pick a slot and create: `gog calendar create primary --summary="..." --from="..." --to="..." --attendees="..." --with-meet --dry-run`
3. After user confirms, execute without `--dry-run`

### Daily Agenda

```bash
gog calendar events --today --all
```

### Weekly Review

```bash
gog calendar events --week --all
gog calendar conflicts --week
```

## Safety Rules

- **Never create, update, or delete events without `--dry-run` preview and user confirmation.**
- Default `--send-updates=none` when creating/updating to avoid surprise notifications. Ask the user if they want to notify attendees.
- When listing events, default to `--max=10` to keep output manageable.
- For recurring event updates, clarify scope (single/future/all) with the user before proceeding.
