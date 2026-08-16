import { expect, test } from '@playwright/test';

/**
 * The Google consent screen cannot be driven from a test, so what is verified
 * here is everything around it: that unauthenticated visitors get nowhere, and
 * that a signed-in trader is shown as themselves.
 */

test.describe('signed out', () => {
  // No session for this group.
  test.use({ extraHTTPHeaders: {} });

  for (const path of ['/', '/trades', '/accounts', '/positions/new']) {
    test(`redirects ${path} to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
    });
  }

  test('says plainly that identity and access are different things', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByText(/Signing in with Google proves who you are/)).toBeVisible();
  });

  test('explains a rejected account rather than showing a blank failure', async ({ page }) => {
    await page.goto('/sign-in?error=NOT_ALLOWLISTED');
    await expect(page.getByText(/not on the allowlist/)).toBeVisible();
  });

  test('serves no journal data to an unauthenticated API call', async ({ request }) => {
    for (const path of ['/api/accounts', '/api/positions', '/api/analytics/overview']) {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
    }
  });
});

test.describe('signed in', () => {
  test('shows the trader and offers a way out', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Account menu' }).click();

    // The name also appears on the trigger, so assert inside the open menu.
    const menu = page.getByRole('menu');
    await expect(menu).toContainText('E2E Trader');
    await expect(menu).toContainText('@example.test');
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  });

  test('does not redirect an authenticated visitor to sign-in', async ({ page }) => {
    await page.goto('/trades');
    await expect(page).toHaveURL(/\/trades$/);
  });

  test('sends an already-authenticated visitor away from the sign-in page', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/127\.0\.0\.1:3000\/$/);
  });
});
