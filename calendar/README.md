# calendar

Shows upcoming Google Calendar events inside a Claude Code session, as one Claude Mod
(a function-hooks module, `hooks/register.ts`). Nothing it shows enters the conversation.

- **`/cal`**: toggles a band above the prompt listing the next 7 days of events.
- **`/cal N`**: lists the next N days (1–31), turns the band on, and remembers N.

Built and tested against Claude Code 2.1.282.

## Where events come from

Every fetch goes through the claude.ai Google Calendar connector with `$.mcp.call`: one
`list_calendars`, then one `list_events` per calendar for the window from now to N days
ahead. Every calendar you can see is listed except those named in the plugin option
`exclude_calendars` (names or ids). Claude Code asks for it when the plugin is enabled; a
list option has no `/config` row, so change it later under
`pluginConfigs["calendar@<marketplace>"].options` in `~/.claude/settings.json`.

Events are fetched when `/cal` turns the band on, at session start when the band was left
on, and every 15 minutes while it is on. Nothing is fetched while the band is off. A fetch
never blocks a prompt or a tool call. The claude.ai connectors are still connecting when a
session starts, so a failed fetch with nothing yet on screen is retried every 30 s, at most
10 times.

**`$.mcp.call` asks no permission.** Any installed Claude Mod can read your mail and
calendar through a connected claude.ai connector this way. Install third-party mods with
that in mind.

## The band

One line per event, soonest first, in the machine's time zone (`TZ` when set):

```
今天      14:00–15:00        Dentist  @Clinic  還有 4h
明天      全天               中秋節
09/27 日  22:00–09/28 01:30  Trip
09/28 一  18:00–21:00        Dinner  @Home
```

- The day reads `今天`, `明天`, or `MM/DD <weekday>`, in blue.
- An all-day event reads `全天`; a timed one its start and end, with the end's date when it
  ends on another day.
- The first timed event (the one under way, or the next to start) has its title in bold
  green. Today's timed events end in a green countdown, `還有 3h 45m`, or `進行中` once
  started; the band redraws every minute so it keeps moving.
- `@<location>` follows the title, dimmed, when the event has one.
- Cancelled events are left out, and an event shared into several calendars shows once.
- A dim notice line says `Fetching calendar events`, `Unavailable: <reason>` before any
  fetch succeeded, `Stale: <reason>; showing data from <age> ago` after a failed one, or
  `No events in the next N days`.
- More events than the band holds end in a dim `… N more`. Every line is cut at the band's width.

The band's on/off state and N are kept in the plugin's store and read at session start.

## Enabling

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
```

The switch enables the modules of every installed plugin, not only this one.

## Tests

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test calendar
```

The fixtures in `tests/fixtures/world.ts` are synthetic; no real calendar data belongs in
this repo.
