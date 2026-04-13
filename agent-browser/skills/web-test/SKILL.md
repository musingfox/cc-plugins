---
name: web-test
description: >-
  This skill should be used when the user asks to "debug a web page", "find what's wrong with
  this page", "investigate a UI bug", "figure out why this page is broken", "why is this button
  not working", "generate tests from debugging", "create regression tests for a page",
  "write E2E tests after exploring", "debug and write tests", "fix a flaky test",
  "debug a failing Playwright test", or when combining agent-browser exploration with Playwright
  test generation. Orchestrates the debug-to-test workflow.
  Do NOT use for writing standalone Playwright tests without a debugging/exploration phase —
  use the playwright skill instead.
---

# Web Test: Debug-to-Test Workflow

## Overview

This skill orchestrates a four-phase workflow: explore a web page with agent-browser to identify issues, diagnose problems, map element references to Playwright locators, and generate test scripts that capture findings as regression tests.

**Prerequisites**: `agent-browser` CLI installed (`npm install -g agent-browser && agent-browser install`) and `@playwright/test` installed in the project (`npm install -D @playwright/test && npx playwright install`).

The four phases:
```
Explore (agent-browser) → Diagnose → Map refs to locators → Generate Playwright test
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
4. **Interaction test** — Click buttons, fill forms, navigate links. Re-snapshot after each action to verify state changes.
5. **Scroll exploration** — `scroll down N` then re-snapshot to find below-fold content.
6. **Annotated verification** — `screenshot --annotate` to visually confirm ref-to-element mapping.

**Record every interaction step** — these become the basis for test cases in Phase 4.

Exploration is complete when all visible sections have been inspected, all interactive elements have been tested, and all observed defects have been recorded.

## Phase 2: Diagnose Issues

Categorize findings from exploration:

| Category | Detection Method | Example |
|----------|-----------------|---------|
| Missing element | Expected ref absent from snapshot | Button in spec but not in DOM |
| Wrong text | Snapshot shows incorrect label/content | "Save" button labeled "Svae" |
| Broken interaction | Action produces no or wrong state change | Submit button doesn't navigate |
| Visual defect | Screenshot shows layout/style issues | Overlapping elements, clipped text |
| Accessibility gap | Snapshot shows missing roles/labels | Input without associated label |

### Fallback to Playwright for Advanced Diagnostics

When agent-browser cannot diagnose the root cause (console errors, network failures, JavaScript state, iframes, shadow DOM), switch to Playwright library mode. Use `page.on('console')` for console errors, `page.on('response')` for network failures, and `page.evaluate()` for JavaScript state inspection.

For diagnostic code templates and the full fallback scenario reference, consult `references/playwright-diagnostics.md`.

## Phase 3: Map Refs to Playwright Locators

Convert agent-browser snapshot information to Playwright locators using strict precision order:

| agent-browser Snapshot Info | Playwright Locator | Priority |
|----------------------------|-------------------|----------|
| Element has `data-testid` attribute | `getByTestId('value')` | 1 (highest) |
| Role + accessible name: `button "Submit"` | `getByRole('button', { name: 'Submit' })` | 2 |
| Input with label: `textbox "Email"` | `getByLabel('Email')` | 3 |
| Input with placeholder | `getByPlaceholder('Enter email')` | 4 |
| Visible text content | `getByText('text', { exact: true })` | 5 |
| Custom data attribute | `page.locator('[data-attr="value"]')` | 6 |
| CSS selector (last resort) | `page.locator('css')` | 7 |

### Mapping Rules

1. **Read snapshot roles carefully** — agent-browser reports element roles from the accessibility tree (`button`, `textbox`, `link`, `heading`, `checkbox`, `combobox`). These map directly to Playwright's `getByRole()` first parameter.

2. **Check for test IDs** — Run `snapshot` (full mode, not `-i`) to reveal element attributes. If `data-testid` exists, use `getByTestId()`.

3. **Prefer role + name** — The snapshot format `@e1: button "Sign In"` maps directly to `getByRole('button', { name: 'Sign In' })`.

4. **Use exact matching** — Always pass `{ exact: true }` to text-based locators: `getByText('Submit', { exact: true })`.

5. **Validate uniqueness** — Each locator must identify exactly one element. If ambiguous, narrow with:
   - `.filter({ hasText: 'unique context' })`
   - Scope to parent: `page.locator('.section').getByRole(...)`

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
