---
name: browser
description: >-
  Use for a browser the user can watch and take over: showing the user a page,
  operating a site that needs JavaScript or a login, handing a login, 2FA, payment
  or API-key step to the user, or scripting a page headless or in a batch. Drives
  the user's Search browser first and falls back to a separate agent Zen. Not for
  Playwright tests (use agent-browser).
allowed-tools: Bash(zen-agent start) Bash(zen-agent start --headless) Bash(zen-agent status) Bash(zen-agent open *) Bash(zen-agent headed) Bash(zen-agent headless) Bash(zen-agent run *)
---

# browser

Two browsers, one at a time:

- **Search** (the `search` MCP tools) is the default. It is the user's own Search
  app (WebKit); you work in tabs of your own, marked with a dot, beside the user's.
- **Agent Zen** (`zen-agent run SCRIPT.ts`) is the fallback. It is a second Zen on
  its own profile, framed in red, beside the user's everyday Zen.

## Choose

Start in Search unless one of these holds. When one does, go to the agent Zen with a
script; do not retry Search.

| Condition | What to do in the agent Zen script |
|---|---|
| A search tool returned an error, the connection dropped, or a call timed out with no answer | Redo the step in a script; tell the user Search failed |
| A `select` dropdown | `await page.select('#id', 'value')` |
| An iframe | `const f = await (await page.$('iframe')).contentFrame(); await f.click('#btn')` |
| A confirm, alert or prompt dialog (in Search it freezes the tab) | `page.on('dialog', d => d.accept())` before the click; `d.dismiss()` to cancel |
| A file upload | `await (await page.$('input[type=file]')).uploadFile('/abs/path')` |
| A download | `page.evaluate(async u => (await fetch(u)).text(), href)`, then `Bun.write` it into the scratchpad. A click saves to `~/Downloads` with no choice of folder |
| Console messages or network requests | `page.on('console', m => ...)`, `page.on('response', r => ...)` before the action |
| Running JavaScript in the page | `await page.evaluate(() => ...)` |
| No window wanted | `zen-agent start --headless` |
| The same steps over many pages, URLs or viewports | One script with a loop |

A shadow root works in both; in a script, pierce it with `page.click('#host >>> button')`.

Switching costs the login: Search keeps its logins in Search, and the agent Zen has
its own profile (see *When a login is needed*).

Before a script, check the page state from the page itself (the status text the
action should change), not from the tool's `ok`.

## Search

- `open_tab URL` starts. The first call of a connection asks the user in Search's
  window; on `waiting_for_person`, tell the user to look at Search, then call again.
  Search must be running with Settings › About › Developer › "Let coding agents use
  Search" on.
- `read_page` returns controls with handles and the page text in one call. Each call
  ends the previous handles. Pass `text: false` when only controls matter, and
  `max_text` to cap the text.
- `click`, `type` (`keys: true` for pages that listen to key events, `submit: true`
  to submit), `press`, `scroll`. Then `wait_for` a condition (text, url, role/name)
  instead of re-reading in a loop.
- `screenshot` only when the look itself is the question; each image stays in context.
- `disconnect` when the browser part is done; your tabs stay for the user.
- If Search says the user stopped you or said no, do not ask again unless told to.

Search withholds password, card and one-time-code values and refuses downloads and
file choosers by design.

## Agent Zen

- `zen-agent start` launches it (`--headless` for no window); `zen-agent status`
  checks it. `zen-agent headed` and `zen-agent headless` switch modes by restarting;
  tabs come back. Switch to headed before showing the user anything or handing over.
- `zen-agent open URL` shows a page to the user. In a Rex shell a plain `open URL` or
  `$BROWSER URL` from an agent lands there too.
- `zen-agent run SCRIPT.ts` runs one puppeteer-core script over WebDriver BiDi and
  prints what it returns as JSON. The script default-exports
  `async ({ browser }) => result`; open your own page with `browser.newPage()` and
  close it at the end. Return the fields you need, never a whole page. Keep scripts in
  the scratchpad. A script that needs to see the page saves `page.screenshot({ path })`
  into the scratchpad and returns the path.
- The zen MCP tools only look (`list_pages`, `navigate_page`, `take_snapshot`,
  `get_page_text`): use them to learn an unfamiliar page before scripting it, and act
  through the script.
- Firefox takes one automation client at a time. Exit 3 from `zen-agent run` means
  the zen MCP holds it: call `close_firefox_session`, then run again. Call
  `close_firefox_session` when the browser part is done.

### When a login is needed

1. Ask the user whether to copy that site's cookies from their everyday Zen.
2. If yes: call `close_firefox_session`, then run `zen-agent cookies DOMAIN` (it also
   covers subdomains). The user approves the command at the permission prompt. Exit 3
   means the session was still held.
3. If no, or the site still shows a login: hand it over (below).

## Hand over a critical step

Login forms, 2FA, CAPTCHAs, payments, and anything irreversible are the user's to do.
So is any step that puts a secret on screen: a button or link that generates, creates,
regenerates, reveals or shows an API key, token, password, client secret or recovery
code. Stop before it on your own; the user does not have to ask. A secret that reaches
page text, a snapshot or a screenshot lands in the transcript; Search redacts password
fields, not secrets printed as page text.

1. Navigate to the page and stop before the step.
2. Tell the user where to act (the Search tab with the dot, or the red agent Zen
   window) and that you are waiting. When the step shows a secret, ask them to copy it
   and leave that page before saying done.
3. Continue only after the user says it is done, starting with `list_tabs` (Search) or
   `list_pages` (agent Zen). After a secret step, first confirm from the URL that the
   tab has left that page; if it has not, ask the user again.
