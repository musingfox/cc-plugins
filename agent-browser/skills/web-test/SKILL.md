---
name: web-test
description: >-
  Use to debug a live web page and convert findings into Playwright regression tests —
  investigate UI bugs, generate E2E tests from exploration. Orchestrates
  the debug-to-test workflow. Not for writing standalone tests with no exploration (use playwright).
---

# Web Test: Debug-to-Test Workflow

## Overview

This skill orchestrates a five-phase workflow: explore a web page with agent-browser to identify issues, diagnose problems, map element references to Playwright locators, generate test scripts that capture findings as regression tests, and run them.

**Prerequisites**: `agent-browser` CLI installed (`npm install -g agent-browser && agent-browser install`) and `@playwright/test` installed in the project (`npm install -D @playwright/test && npx playwright install`).

The five phases:
```
Explore (agent-browser) → Diagnose → Map refs to locators → Generate Playwright test → Run it
```

## Phase 1: Explore with agent-browser

Navigate to the target page and systematically inspect its state:

```bash
agent-browser open <url>
agent-browser snapshot -i
```

Investigation checklist:
1. **Visual scan** — `screenshot` to observe layout, visual state, and obvious defects.
2. **Interactive inventory** — `snapshot -i` to list all interactive elements with refs.
3. **Section focus** — `snapshot -s ".section"` to isolate specific areas of interest.
4. **Interaction test** — Click, fill, and navigate along the path that reproduces the reported issue, or the flow the user asked about. Re-snapshot after each action to verify state changes.
5. **Scroll exploration** — `scroll down 500` (pixels) or `scrollintoview @eN`, then re-snapshot to find below-fold content.
6. **Annotated verification** — `screenshot --annotate` to visually confirm ref-to-element mapping.

**Record every interaction step** — these become the basis for test cases in Phase 4.

Ask the user before an action you cannot undo — delete, send, purchase, log out, change account settings — and before submitting any form on a host other than `localhost` or `127.0.0.1`. The page is real: a click there acts on real data.

Exploration is complete when the reported issue has been reproduced (or shown not to occur), the elements on its path have been exercised, and every observed defect has been recorded.

## Phase 2: Diagnose Issues

Categorize findings from exploration:

| Category | Detection Method | Example |
|----------|-----------------|---------|
| Missing element | Expected ref absent from snapshot | Button in spec but not in DOM |
| Wrong text | Snapshot shows incorrect label/content | "Save" button labeled "Svae" |
| Broken interaction | Action produces no or wrong state change | Submit button doesn't navigate |
| Visual defect | Screenshot shows layout/style issues | Overlapping elements, clipped text |
| Accessibility gap | Snapshot shows missing roles/labels | Input without associated label |

### Runtime Diagnostics with agent-browser

Inspect runtime state with the same CLI before reaching for Playwright:

| Need | Command |
|------|---------|
| Console messages | `agent-browser console` |
| Uncaught page errors | `agent-browser errors` |
| JavaScript state | `agent-browser eval '<js>'` |
| Cookies | `agent-browser cookies` |
| localStorage / sessionStorage | `agent-browser storage local`, `agent-browser storage session` |
| Requests the page made | `agent-browser network requests` |

`network requests` records only what happens after its first call, and its entries carry no HTTP status. Call it once before reproducing the issue, then again to read the list.

### Fallback to Playwright

Switch to Playwright library mode only for what the CLI cannot show: response status codes (failed API calls), iframe content, and shadow DOM. For the script template, how to run it, and the scenario reference, consult `references/playwright-diagnostics.md`.

## Phase 3: Map Refs to Playwright Locators

Convert agent-browser snapshot information to Playwright locators. Apply the locator precision order from the playwright skill (getByTestId > getByRole > getByLabel > getByPlaceholder > getByText > data attributes > CSS).

### Snapshot-to-Locator Mapping

agent-browser reports element roles from the accessibility tree. Map them directly to Playwright locators:
- `data-testid` attribute → `getByTestId()` (always preferred)
- Role + accessible name (e.g., `button "Submit"`) → `getByRole('button', { name: 'Submit' })`
- Input with label (e.g., `textbox "Email"`) → `getByLabel('Email')`
- Always pass `{ exact: true }` to text-based locators
- If ambiguous, narrow with `.filter({ hasText: 'unique' })` or scope to parent

### Snapshot-to-Locator Examples

```
Snapshot output:                        Playwright locator:
─────────────────────────────────────────────────────────────
@e1: button "Submit"                 →  getByRole('button', { name: 'Submit' })
@e2: textbox "Email"                 →  getByLabel('Email')
@e3: link "Learn more"               →  getByRole('link', { name: 'Learn more' })
@e4: heading "Dashboard" [level=1]   →  getByRole('heading', { name: 'Dashboard', level: 1 })
@e5: checkbox "Remember me"          →  getByLabel('Remember me')
@e6: combobox "Country"              →  getByLabel('Country')
```

## Phase 4: Generate Playwright Test

Transform exploration steps and diagnosed issues into a structured test file:

```typescript
import { test, expect } from '@playwright/test';

test.describe('<Feature or Page Name>', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('<url>');
  });

  // Happy path — captures the successful interaction flow
  test('should <expected behavior description>', async ({ page }) => {
    // Arrange
    const emailField = page.getByLabel('Email');
    const submitButton = page.getByRole('button', { name: 'Submit' });

    // Act
    await emailField.fill('test@example.com');
    await submitButton.click();

    // Assert
    await expect(page.getByText('Success', { exact: true })).toBeVisible();
  });

  // Regression test — prevents a diagnosed bug from reappearing
  test('should not show error when <fixed scenario>', async ({ page }) => {
    // Reproduce the scenario that previously failed
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await deleteButton.click();

    // Verify the fix holds
    await expect(page.getByText('Item deleted', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});
```

### Test Generation Rules

1. **One test per behavior** — Each test verifies one specific interaction flow or state.
2. **Regression tests for bugs** — For each diagnosed issue, create a test that fails if the bug reappears.
3. **AAA pattern** — Arrange (locate elements), Act (interact), Assert (verify outcome).
4. **Descriptive test names** — Describe the expected behavior: `'should navigate to dashboard after login'`, not `'test login'`.
5. **Minimal interactions** — Include only steps necessary to reach the assertion. Remove exploration noise.
6. **Use web assertions** — Always `await expect(locator).toBeVisible()`, never `expect(await locator.isVisible()).toBe(true)`.

### Including Fallback Diagnostics in Tests

When console or network issues were diagnosed during Phase 2, convert them into test assertions. For diagnostic test patterns (console error detection, network health, JavaScript error tests), consult `references/playwright-diagnostics.md`.

## Phase 5: Run the Tests

A generated test is not done until it has run. Run the file with the project's Playwright runner:

```bash
npx playwright test <path/to/generated.spec.ts>
```

- **Happy-path tests** must pass. On failure, read the error, fix the locator or the wait, and run again until green.
- **Regression tests** must fail for the bug's own reason while the bug is present — a regression test that passes against broken behavior proves nothing. If the bug is still unfixed, confirm the failure message points at the defect, then tell the user the test will pass once the fix lands. If the fix is already in place, confirm the test fails with the fix reverted, then passes with it restored.

Report the final run's pass/fail counts to the user.

## Complete Workflow Example

```
1. agent-browser open https://app.example.com/login
2. agent-browser snapshot -i
   → @e1: textbox "Email"
   → @e2: textbox "Password"
   → @e3: button "Sign In"
3. agent-browser fill @e1 "test@example.com"
4. agent-browser fill @e2 "password123"
5. agent-browser click @e3
6. agent-browser snapshot -i
   → @e4: heading "Dashboard"
   → @e5: button "Logout"
7. agent-browser screenshot
   → Dashboard loaded correctly

Generated test:

  test('should login and reach dashboard', async ({ page }) => {
    await page.goto('https://app.example.com/login');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });
```
