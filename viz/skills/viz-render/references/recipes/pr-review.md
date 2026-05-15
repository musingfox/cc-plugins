# Recipe: pr-review

Generates an interactive PR review interface from a structured markdown file.
Markdown is the canonical source — the HTML reads from it on load and exports
back to it on Export. Edit either side, just keep markdown as source of truth.

## Trigger

Use this recipe when the user asks for a PR review, code review, or
findings/issues report that needs severity grouping and per-item status
tracking.

## Markdown structure

```markdown
---
viz: pr-review
title: <free text — shown in header>
---

# Summary

<Optional free-text overview. Plain prose, can span multiple paragraphs.>

## <Severity name>

### <Finding title>
- file: <path or path:line>
- impact: <one-line consequence>
- fix: <suggested remediation>
- status: open

### <Another finding under same severity>
- file: ...
- impact: ...
- fix: ...
- status: open
```

### Rules

- **Frontmatter is required.** Must contain `viz: pr-review`. `title:` is optional but recommended.
- **`# Summary`** — H1 with text containing "summary" (case-insensitive). Body
  is free prose. Optional.
- **`## <Severity>`** — H2. Severity name is free text; recipe pre-styles
  `Critical`, `High`, `Medium`, `Low`, `Info` with color stripes. Other names
  render with a neutral stripe.
- **`### <Title>`** — H3. Each H3 under a severity becomes one finding card.
- **`- key: value`** — bullet list under a finding becomes the meta grid. Keys
  are free; common ones: `file`, `impact`, `fix`, `status`. Keys named `file`,
  `path`, or `location` get rendered as `<code>` for visual emphasis.
- **`status:`** — values: `open` / `fixed` / `wontfix`. Defaults to `open` if
  absent. Click the status badge in the UI to cycle.

## Bidirectional flow

1. Agent writes the markdown file (canonical source).
2. `bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" <file.md> review-<name>` opens
   the interactive HTML in the browser.
3. User edits in the HTML: cycles statuses, edits any field inline, filters by
   severity.
4. User clicks **Export markdown** → updated markdown is on the clipboard.
5. User pastes back to the agent. Agent overwrites the source `.md` and
   re-renders. Loop.

## Round-trip preservation

The recipe preserves: frontmatter key order, severity section order, finding
order within a section, and meta key order within a finding. New fields added
inline in the HTML are not yet supported (Phase 1 limitation — only existing
fields are editable).

## Example

```markdown
---
viz: pr-review
title: PR #482 — Add OAuth flow
---

# Summary

Overall direction is right but two blocking security issues. Login UX needs
polish before merge.

## High

### Token stored in localStorage instead of httpOnly cookie
- file: src/auth/session.ts:34
- impact: XSS can exfiltrate the token, full account takeover
- fix: Set httpOnly cookie server-side; remove localStorage write
- status: open

### Missing CSRF token on /oauth/callback
- file: src/routes/oauth.ts:88
- impact: Attacker can complete OAuth flow on victim's behalf
- fix: Verify state parameter matches session-bound nonce
- status: open

## Medium

### Login button has no loading state
- file: src/components/LoginButton.tsx:12
- impact: Double-click submits twice
- fix: Disable button while request in flight
- status: open
```
