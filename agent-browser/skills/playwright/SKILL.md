---
name: playwright
description: >-
  This skill should be used when the user asks to "write a Playwright test", "create E2E tests",
  "add test assertions", "set up Playwright", "write a test spec", "use Playwright locators",
  "check element visibility", "test a web page", or mentions Playwright, @playwright/test,
  E2E testing, browser testing, or test automation frameworks. Focuses on writing and structuring
  Playwright tests with high-precision locator strategies.
  Do NOT use for interactive browser exploration or debugging live pages — use agent-browser
  or web-test instead.
---

# Playwright Test Writing

## Overview

Write browser tests using `@playwright/test`, the official Playwright test runner. It provides auto-waiting, test isolation, built-in web assertions with auto-retry, and parallel execution out of the box.

Prefer `@playwright/test` for all testing scenarios. Use library mode (`playwright`) only for direct browser scripting needs: console error capture, network inspection, or custom automation outside a test context.

## Project Setup

```bash
# Initialize Playwright in a project
npm init playwright@latest

# Or add to existing project
npm install -D @playwright/test
npx playwright install
```

Essential `playwright.config.ts` (for full multi-browser, reporter, and webServer config, see `references/api-patterns.md`):

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
});
```

## Test File Structure

Tests follow the pattern: `tests/<feature>.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should perform expected behavior', async ({ page }) => {
    // Arrange
    const submitButton = page.getByRole('button', { name: 'Submit' });

    // Act
    await submitButton.click();

    // Assert
    await expect(page.getByText('Success')).toBeVisible();
  });
});
```

Always use the AAA pattern: **Arrange** (locate elements), **Act** (interact), **Assert** (verify outcome).

## Locator Strategy (Precision Order)

Apply locators in strict priority order — always prefer the highest-precision option available:

| Priority | Locator | When to Use | Stability |
|----------|---------|-------------|-----------|
| 1 | `getByTestId('id')` | Element has `data-testid` attribute | Highest — immune to text/structure changes |
| 2 | `getByRole('role', { name })` | Element has clear ARIA role and accessible name | Very high — maps from accessibility tree |
| 3 | `getByLabel('label')` | Form inputs with associated `<label>` | High — tied to label text |
| 4 | `getByPlaceholder('text')` | Input with placeholder text | Medium-high — placeholder may change |
| 5 | `getByText('text', { exact: true })` | Visible text content | Medium — text may change |
| 6 | `page.locator('[data-attr="val"]')` | Custom data attributes | Medium — depends on attribute stability |
| 7 | `page.locator('css')` | Last resort — specific CSS selector | Low — fragile to DOM restructuring |

**Rules:**
- Never use index-based locators (`nth(0)`) unless testing a list where index is semantically meaningful.
- Never use XPath unless no other option exists.
- Always pass `{ exact: true }` to `getByText()` to prevent partial matches.
- Prefer accessibility-based locators (`getByRole`, `getByLabel`) — they match what users see and interact with.
- When multiple elements share the same locator, narrow with `.filter({ hasText: 'unique' })` or scope to a parent.

For locator disambiguation patterns (filter, chaining, scoping), see `references/api-patterns.md`.

## Web Assertions (Auto-retry)

Playwright's `expect` API auto-retries assertions until timeout (default 5s):

```typescript
// Visibility
await expect(locator).toBeVisible();
await expect(locator).toBeHidden();

// Text content
await expect(locator).toHaveText('exact text');
await expect(locator).toContainText('partial');

// Input values
await expect(locator).toHaveValue('input value');

// Attributes
await expect(locator).toHaveAttribute('href', '/path');

// Count
await expect(locator).toHaveCount(3);

// Element state
await expect(locator).toBeEnabled();
await expect(locator).toBeDisabled();
await expect(locator).toBeChecked();

// Page-level
await expect(page).toHaveURL(/\/dashboard/);
await expect(page).toHaveTitle('Dashboard');
```

**Critical**: Always use `await expect(locator).toHaveText()` — not `expect(await locator.textContent()).toBe()`. Web assertions auto-retry; manual extraction does not.

## Page Interactions

```typescript
// Click
await page.getByRole('button', { name: 'Save' }).click();

// Fill (clears existing content first)
await page.getByLabel('Email').fill('user@example.com');

// Type sequentially (appends, triggers key events)
await page.getByLabel('Search').pressSequentially('query');

// Select dropdown
await page.getByLabel('Country').selectOption('US');

// Check / uncheck
await page.getByLabel('Agree to terms').check();

// Keyboard
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');

// File upload
await page.getByLabel('Upload').setInputFiles('path/to/file.pdf');

// Wait for navigation
await page.waitForURL('/dashboard');
```

## Test Lifecycle

```typescript
test.describe('Suite', () => {
  test.beforeAll(async () => {
    // Run once before all tests in this suite
  });

  test.beforeEach(async ({ page }) => {
    // Run before each test — common setup (e.g., navigation)
  });

  test.afterEach(async ({ page }) => {
    // Run after each test — cleanup
  });

  test.afterAll(async () => {
    // Run once after all tests in this suite
  });
});
```

### Custom Fixtures

Extend the `test` object with reusable setup logic:

```typescript
import { test as base, Page } from '@playwright/test';

const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@test.com');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/dashboard');
    await use(page);
  },
});

test('should show user profile', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/profile');
  await expect(authenticatedPage.getByRole('heading', { name: 'Profile' })).toBeVisible();
});
```

## Running Tests

```bash
npx playwright test                    # Run all tests
npx playwright test login.spec.ts      # Run specific file
npx playwright test --headed           # Visible browser
npx playwright test --ui               # Interactive UI mode
npx playwright test --debug            # Step-through debugger
npx playwright show-report             # View HTML report
```

## Library Mode (Advanced)

Use `playwright` (not `@playwright/test`) when direct browser control is needed outside a test runner:

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Console error capture
page.on('console', msg => {
  if (msg.type() === 'error') console.log('Console error:', msg.text());
});

// Network request inspection
page.on('response', response => {
  if (response.status() >= 400)
    console.log(`Failed: ${response.status()} ${response.url()}`);
});

// JavaScript execution in page context
const title = await page.evaluate(() => document.title);

// Cookie inspection
const cookies = await context.cookies();

await browser.close();
```

Use library mode for: console error capture, network inspection, `page.evaluate()`, iframe/shadow DOM exploration, cookie/localStorage checks.

## Additional Resources

### Reference Files

For detailed locator mapping, assertion catalog, and advanced configuration:
- **`references/api-patterns.md`** — Locator disambiguation patterns, assertion quick reference, advanced fixtures and configuration
