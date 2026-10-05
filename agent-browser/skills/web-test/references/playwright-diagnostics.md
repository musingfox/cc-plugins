# Playwright Diagnostics Reference

Code patterns for what the agent-browser CLI cannot show: HTTP response status, iframe content, and shadow DOM. Console messages, page errors, JavaScript state, cookies, and storage come from the CLI (see Phase 2 in SKILL.md).

## Contents

- [Diagnostic Script Template](#diagnostic-script-template) — capture failed responses from a page load
- [Fallback Scenario Reference](#fallback-scenario-reference) — which Playwright API answers which question
- [Diagnostic Test Patterns](#diagnostic-test-patterns) — console, network, and page-error assertions for Phase 4

## Diagnostic Script Template

Save as `playwright-diag.mjs` in the project root, so `@playwright/test` (a Phase 1 prerequisite) resolves from the project's `node_modules`. Run it with `node playwright-diag.mjs`, read the output, then delete the file.

```js
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

// Responses with an error status: the CLI's request log carries no status
const failedResponses = [];
page.on('response', resp => {
  if (resp.status() >= 400) failedResponses.push(`${resp.status()} ${resp.url()}`);
});

// Requests that never got a response (DNS, CORS, aborted)
const failedRequests = [];
page.on('requestfailed', req => {
  failedRequests.push(`${req.failure()?.errorText} ${req.url()}`);
});

await page.goto('<url>');
await page.waitForLoadState('networkidle');

console.log('Failed responses:', failedResponses);
console.log('Failed requests:', failedRequests);

await browser.close();
```

## Fallback Scenario Reference

| Scenario | Playwright API | Notes |
|----------|---------------|-------|
| Network response failures | `page.on('response')` | Check `response.status() >= 400` |
| Requests with no response | `page.on('requestfailed')` | `request.failure().errorText` gives the reason |
| Wait for specific API call | `page.waitForResponse('**/api/endpoint')` | Wait for matching response |
| iframe content | `page.frameLocator('#id')` | Locate by CSS selector or name |
| Shadow DOM traversal | `page.locator('host-element').getByRole('button', { name: 'Click' })` | Every locator pierces open shadow roots by default; XPath and closed shadow roots do not |
| File upload | `locator.setInputFiles('path')` | Works with `<input type="file">` |
| File download | `page.waitForEvent('download')` | Capture download stream |

## Diagnostic Test Patterns

### Console Error Detection Test

```typescript
test('should not produce console errors on page load', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('<url>');

  expect(errors).toHaveLength(0);
});
```

### Network Health Test

```typescript
test('should load all API resources successfully', async ({ page }) => {
  const failedRequests: string[] = [];
  page.on('response', resp => {
    if (resp.status() >= 400)
      failedRequests.push(`${resp.status()} ${resp.url()}`);
  });

  await page.goto('<url>');
  await page.waitForLoadState('networkidle');

  expect(failedRequests).toHaveLength(0);
});
```

### JavaScript Error Detection Test

```typescript
test('should not throw unhandled JavaScript errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => {
    errors.push(error.message);
  });

  await page.goto('<url>');

  expect(errors).toHaveLength(0);
});
```
