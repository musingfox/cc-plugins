# Playwright API Patterns Reference

## Locator Disambiguation

When multiple elements match the same locator, narrow the match:

### Filter by Text

```typescript
// Multiple "Edit" buttons — narrow by surrounding text
page.getByRole('button', { name: 'Edit' }).filter({ hasText: 'Profile' });

// Or scope to a parent
page.locator('.profile-section').getByRole('button', { name: 'Edit' });
```

### Filter by Nth (Only When Semantically Meaningful)

```typescript
// Testing a list — nth makes sense here
const items = page.getByRole('listitem');
await expect(items.nth(0)).toHaveText('First item');
await expect(items.nth(1)).toHaveText('Second item');
```

### Chaining Locators

```typescript
// Narrow step by step
const dialog = page.getByRole('dialog');
const saveButton = dialog.getByRole('button', { name: 'Save' });
await saveButton.click();
```

### Filter by Has

```typescript
// Row containing specific text
page.getByRole('row').filter({ has: page.getByText('John Doe') });
```

## Assertion Quick Reference

### Element State Assertions (Auto-retry)

| Assertion | Description |
|-----------|-------------|
| `toBeVisible()` | Element is visible in viewport |
| `toBeHidden()` | Element is not visible |
| `toBeEnabled()` | Element is enabled (not disabled) |
| `toBeDisabled()` | Element is disabled |
| `toBeChecked()` | Checkbox/radio is checked |
| `toBeEditable()` | Element is editable |
| `toBeFocused()` | Element has focus |
| `toBeEmpty()` | Element has no children or text |
| `toBeAttached()` | Element exists in DOM |

### Content Assertions (Auto-retry)

| Assertion | Description |
|-----------|-------------|
| `toHaveText('exact')` | Exact text match |
| `toHaveText(/regex/)` | Regex text match |
| `toContainText('partial')` | Partial text match |
| `toHaveValue('val')` | Input value |
| `toHaveValues(['a', 'b'])` | Multi-select values |
| `toHaveAttribute('name', 'val')` | Attribute value |
| `toHaveClass(/class/)` | CSS class match |
| `toHaveCSS('color', 'rgb(0,0,0)')` | CSS property value |
| `toHaveCount(N)` | Number of matching elements |
| `toHaveId('id')` | Element id attribute |

### Page Assertions (Auto-retry)

| Assertion | Description |
|-----------|-------------|
| `toHaveURL('url')` | Exact URL match |
| `toHaveURL(/regex/)` | Regex URL match |
| `toHaveTitle('title')` | Exact title match |
| `toHaveTitle(/regex/)` | Regex title match |

### Negation

```typescript
await expect(locator).not.toBeVisible();
await expect(page).not.toHaveURL('/login');
```

### Custom Timeout

```typescript
await expect(locator).toBeVisible({ timeout: 10_000 }); // 10 seconds
```

## Advanced Fixtures

### Page Object Model

```typescript
// pages/login-page.ts
import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

### Shared Authentication State

```typescript
// auth.setup.ts
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@test.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/dashboard');

  // Save authentication state
  await page.context().storageState({ path: '.auth/user.json' });
});
```

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'tests',
      dependencies: ['setup'],
      use: { storageState: '.auth/user.json' },
    },
  ],
});
```

## Network Interception

### Mock API Responses

```typescript
await page.route('**/api/users', route =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 1, name: 'Mock User' }]),
  })
);
```

### Wait for Specific Network Request

```typescript
const responsePromise = page.waitForResponse('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
const response = await responsePromise;
expect(response.status()).toBe(200);
```

### Abort Requests

```typescript
// Block images to speed up tests
await page.route('**/*.{png,jpg,jpeg,gif}', route => route.abort());
```

## iframe Handling

```typescript
// Locate iframe and interact
const frame = page.frameLocator('#payment-iframe');
await frame.getByLabel('Card number').fill('4242424242424242');
await frame.getByRole('button', { name: 'Pay' }).click();
```

## Shadow DOM

```typescript
// Playwright pierces open shadow DOM by default with CSS locators
await page.locator('custom-element').getByRole('button', { name: 'Click' }).click();
```

## Visual Comparison

```typescript
// Screenshot comparison
await expect(page).toHaveScreenshot('homepage.png');
await expect(locator).toHaveScreenshot('component.png', {
  maxDiffPixelRatio: 0.01,
});
```

## Configuration Reference

### Common `playwright.config.ts` Options

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```
