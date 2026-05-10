# Calendar Operations via gog CLI

Alias: `gog calendar` / `gog cal`. Calendar ID defaults to `primary`. Discover others
via `gog calendar calendars`.

## Verify auth

```bash
gog calendar calendars
```

If auth fails: `gog auth add <email> --services calendar`.

## Listing Events

```bash
gog calendar events                          # Next 10 on primary
gog calendar events --today
gog calendar events --tomorrow
gog calendar events --week
gog calendar events --days=7
gog calendar events --from=2026-03-10 --to=2026-03-15
gog calendar events --all                    # All calendars
gog calendar events <calendarId>
```

Key flags: `--today` / `--tomorrow` / `--week` / `--days=N`, `--from` / `--to`
(RFC3339, date, or relative: `today`/`tomorrow`/`monday`), `--query="text"`,
`--max=N`, `--all-pages`, `--all`, `--fields=summary,start,end` (with `--json`),
`--weekday`.

## Searching Events

```bash
gog calendar search "team standup"
gog calendar search "team standup" --from=today --to=friday --calendar=primary
```

## Event Details

```bash
gog calendar event <calendarId> <eventId>
```

## Creating Events

Always preview with `--dry-run`:

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

Key flags: `--summary`, `--from`/`--to` (RFC3339), `--all-day` (date-only),
`--description`, `--location`, `--attendees`, `--with-meet`, `--rrule`
(e.g., `RRULE:FREQ=WEEKLY;BYDAY=MO`), `--reminder=popup:30m` (repeatable),
`--event-color=1` (1–11 — see `gog calendar colors`),
`--visibility=default|public|private|confidential`,
`--transparency=opaque|transparent` (aliases `busy`/`free`),
`--send-updates=all|externalOnly|none` (default `none`).

## Updating Events

```bash
gog calendar update primary <eventId> \
  --summary="Updated Title" \
  --from="2026-03-11T15:00:00" \
  --to="2026-03-11T16:00:00" \
  --dry-run
```

Update-specific:
- `--add-attendee="new@example.com"` — append without replacing existing
- `--scope=single|future|all` (default `all`)
- `--original-start=<time>` — required for `scope=single` / `future`
- Empty value clears the field (e.g., `--description=""`)

## Deleting Events

```bash
gog calendar delete primary <eventId> --dry-run
```

## RSVP

```bash
gog calendar respond primary <eventId> --status=accepted
gog calendar respond primary <eventId> --status=declined --comment="conflict"
gog calendar respond primary <eventId> --status=tentative
```

Statuses: `accepted`, `declined`, `tentative`, `needsAction`.

## Free/Busy and Conflicts

```bash
gog calendar freebusy primary --from="2026-03-10T09:00:00" --to="2026-03-10T18:00:00"
gog calendar freebusy "alice@example.com,bob@example.com" --from=today --to=tomorrow

gog calendar conflicts --today
gog calendar conflicts --week
gog calendar conflicts --days=7 --calendars="primary,work@example.com"
```

## Special Event Types

```bash
gog calendar focus-time --from="2026-03-11T09:00:00" --to="2026-03-11T12:00:00"
gog calendar out-of-office --from="2026-03-15" --to="2026-03-16"
gog calendar working-location --from="2026-03-11" --to="2026-03-11" --type=home
gog calendar working-location --from="2026-03-12" --to="2026-03-12" --type=office --working-office-label="HQ"
```

## Utilities

```bash
gog calendar calendars
gog calendar colors
gog calendar propose-time primary <eventId>
```

## Workflows

**Schedule a Meeting**:
1. `gog calendar freebusy "alice@example.com,bob@example.com" --from=monday --to=friday`
2. `gog calendar create primary --summary="..." --from="..." --to="..." --attendees="..." --with-meet --dry-run`
3. After confirm, execute without `--dry-run`

**Daily Agenda**: `gog calendar events --today --all`

**Weekly Review**: `gog calendar events --week --all` + `gog calendar conflicts --week`
