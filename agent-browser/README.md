# agent-browser Plugin

Browser automation, web debugging, and Playwright test generation for Claude Code agents.

## Prerequisites

- **agent-browser CLI**: `npm install -g agent-browser && agent-browser install`
- **Playwright** (for test generation): `npm install -D @playwright/test && npx playwright install`

## Skills

### agent-browser

Core agent-browser CLI workflow — the ref-based interaction model for browsing and automating web pages.

**Triggers**: "browse a web page", "click an element", "take a screenshot", "use agent-browser"

**Key concept**: Every interaction follows the ref cycle:
```
open URL → snapshot → read refs → interact → re-snapshot → repeat
```

### playwright

Playwright test writing knowledge — `@playwright/test` structure, high-precision locator strategies, and assertion patterns.

**Triggers**: "write a Playwright test", "create E2E tests", "fix a flaky test", "use Playwright locators"

**Key concept**: Locator precision order:
1. `getByTestId()` → 2. `getByRole()` → 3. `getByLabel()` → 4. `getByPlaceholder()` → 5. `getByText(exact)` → 6. CSS selector

### web-test

Debug-to-test workflow — explore pages with agent-browser, diagnose issues, then generate Playwright regression tests.

**Triggers**: "debug a web page", "investigate a UI bug", "generate tests from debugging", "turn browser exploration into test cases"

**Key concept**: Four-phase pipeline:
```
Explore (agent-browser) → Diagnose → Map refs to locators → Generate Playwright test
```

## Installation

```bash
/plugin install agent-browser
```

## File Structure

```
agent-browser/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── agent-browser/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── commands.md
│   ├── playwright/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── api-patterns.md
│   └── web-test/
│       ├── SKILL.md
│       └── references/
│           └── playwright-diagnostics.md
└── README.md
```
