---
name: zen-agent
description: >-
  Use for a visible browser the user can watch and take over: showing the user a page,
  operating a site that needs JavaScript or a login, or handing a login, 2FA, payment
  or API-key step to the user. Not for headless Chrome scripting or Playwright tests (use agent-browser).
allowed-tools: Bash(zen-agent start) Bash(zen-agent start --headless) Bash(zen-agent status) Bash(zen-agent open *) Bash(zen-agent headed) Bash(zen-agent headless)
---

# zen-agent

The agent Zen is a second Zen on its own profile, running beside the user's
everyday Zen, framed in red so the two never get mixed up. Its window is visible
unless started headless, so the user sees every step and can click
or type in it at any time. It never touches the everyday profile, except when
the user approves copying one domain's cookies.

## Start and open

- `zen-agent start` launches it; `zen-agent status` checks it. The zen MCP tools
  fail until it runs.
- `zen-agent open URL` shows a page to the user. In a Rex shell a plain `open URL`
  or `$BROWSER URL` from an agent lands there too.
- `zen-agent start --headless` runs it without a window, for work the user need not
  watch. `zen-agent headed` and `zen-agent headless` switch modes by restarting it:
  call `close_firefox_session` first, then begin again with `list_pages`. Tabs come
  back after the restart. Switch to headed before showing the user anything or
  handing over; `zen-agent open` does this on its own.

## Operate

Use the zen MCP tools: `list_pages`, `navigate_page`, `take_snapshot`, then
`click_by_uid` / `fill_by_uid`, and `screenshot_page` to check the result. Re-run
`take_snapshot` after the user has acted in the window: the page may have changed.

Firefox takes one automation client at a time. Call `close_firefox_session` when
the browser part of the task is done, so the user, another agent or
`zen-agent cookies` can connect.

## When a login is needed

1. Ask the user whether to copy that site's cookies from their everyday Zen.
2. If yes: call `close_firefox_session`, then run `zen-agent cookies DOMAIN`
   (for example `github.com`; it also covers subdomains). The user approves the
   command at the permission prompt. Exit 3 means the session was still held.
3. If no, or the site still shows a login: hand it over (below).

## Hand over a critical step

Login forms, 2FA, CAPTCHAs, payments, and anything irreversible are the user's to do.
So is any step that puts a secret on screen: a button or link that generates, creates,
regenerates, reveals or shows an API key, token, password, client secret or recovery
code. Stop before it on your own; the user does not have to ask. A secret that reaches
a snapshot, page text, screenshot or screencast lands in the transcript.

1. Navigate to the page and stop before the step. Stop any running screencast.
2. Tell the user what to do in the agent Zen window and that you are waiting. When
   the step shows a secret, ask them to copy it and leave that page before saying done.
3. Continue only after the user says it is done, starting with `list_pages` and a
   fresh `take_snapshot`: after two idle minutes the MCP reconnects to whichever tab
   is active. After a secret step, first confirm from `list_pages` that the tab has
   left that page; if it has not, ask the user again instead of taking the snapshot.
