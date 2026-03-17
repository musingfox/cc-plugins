# Playwright Diagnostics Reference

Code patterns for diagnosing issues that agent-browser cannot detect (console errors, network failures, JavaScript state).

## Diagnostic Script Template

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture console errors
const consoleErrors: string[] = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

// Capture failed network requests
const failedRequests: string[] = [];
page.on('response', resp => {
  if (resp.status() >= 400)
    failedRequests.push(`${resp.status()} ${resp.url()}`);
});

await page.goto('<url>');

// Inspect JavaScript state
const appState = await page.evaluate(() => {
  return JSON.stringify((window as any).__APP_STATE__ ?? 'no state found');
});

// Inspect localStorage
const storage = await page.evaluate(() =>
  JSON.stringify(Object.fromEntries(Object.entries(localStorage)))
);

// Inspect cookies
const cookies = await page.context().cookies();

console.log('Console errors:', consoleErrors);
console.log('Failed requests:', failedRequests);
console.log('App state:', appState);
console.log('Storage:', storage);
console.log('Cookies:', cookies);

await browser.close();
```

## Fallback Scenario Reference

| Scenario | Playwright API | Notes |
|----------|---------------|-------|
| Console error detection | `page.on('console')` | Filter by `msg.type() === 'error'` |
| Network request failures | `page.on('response')` | Check `response.status() >= 400` |
| JavaScript state inspection | `page.evaluate()` | Access window globals, DOM APIs |
| iframe content | `page.frameLocator('#id')` | Locate by CSS selector or name |
| Shadow DOM traversal | `page.locator('host >> shadow=selector')` | Pierces open shadow roots |
| Cookie inspection | `context.cookies()` | Returns all cookies for current context |
| localStorage / sessionStorage | `page.evaluate(() => localStorage)` | Execute in page context |
| File upload | `locator.setInputFiles('path')` | Works with `<input type="file">` |
| File download | `page.waitForEvent('download')` | Capture download stream |
| Wait for specific API call | `page.waitForResponse('**/api/endpoint')` | Wait for matching response |

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
