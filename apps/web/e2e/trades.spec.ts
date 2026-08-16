import { expect, test } from '@playwright/test';

/**
 * The overview's browser-only behaviour: filters that live in the URL, the
 * period selector re-grouping the same data, and rows that navigate.
 */
test.describe('Trades overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/trades');
  });

  test('groups into one table per day by default', async ({ page }) => {
    const groups = page.getByTestId('period-group');
    await expect(groups.first()).toBeVisible();
    // Seeded data realizes on six separate local days.
    await expect(groups).toHaveCount(6);
    // Newest first.
    await expect(groups.first()).toContainText('16 AUGUST 2026');
  });

  test('re-groups by ISO week and puts the period in the URL', async ({ page }) => {
    await page.getByRole('radio', { name: 'Week', exact: true }).click();

    await expect(page).toHaveURL(/period=WEEK/);
    const groups = page.getByTestId('period-group');
    await expect(groups).toHaveCount(1);
    await expect(groups.first()).toContainText('WEEK 33');
    await expect(groups.first()).toContainText('10 Aug — 16 Aug 2026');
  });

  test('re-groups by month', async ({ page }) => {
    await page.getByRole('radio', { name: 'Month', exact: true }).click();

    await expect(page).toHaveURL(/period=MONTH/);
    await expect(page.getByTestId('period-group')).toHaveCount(1);
    await expect(page.getByTestId('period-group').first()).toContainText('AUGUST 2026');
  });

  test('filters survive a reload, because they live in the URL', async ({ page }) => {
    await page.goto('/trades?symbol=SOLUSDT&side=SHORT');

    await expect(page.getByText('Realized events').locator('..')).toContainText('1');
    await page.reload();
    // Same view after a refresh — no state was held in the component.
    await expect(page.getByText('Realized events').locator('..')).toContainText('1');
    await expect(page.getByTestId('period-group')).toHaveCount(1);
  });

  test('reports return % only when a single account is in scope', async ({ page }) => {
    await expect(page.getByText('Return % needs a single account')).toBeVisible();

    await page.getByRole('combobox').filter({ hasText: 'All accounts' }).click();
    await page.getByRole('option', { name: 'FTMO Challenge #1' }).click();

    await expect(page).toHaveURL(/accountId=/);
    await expect(page.getByText('of starting balance')).toBeVisible();
  });

  test('resets every filter', async ({ page }) => {
    await page.goto('/trades?symbol=SOLUSDT&side=SHORT&period=WEEK');
    await page.getByRole('button', { name: 'Reset' }).click();

    // Period is not a filter, so it survives the reset.
    await expect(page).toHaveURL(/^[^?]*\?period=WEEK$|^[^?]*$/);
    await expect(page.getByRole('button', { name: 'Reset' })).toBeHidden();
  });

  test('navigates to the position when a row is clicked', async ({ page }) => {
    await page.getByRole('link', { name: 'SOLUSDT' }).first().click();

    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'SOLUSDT' })).toBeVisible();
  });

  test('navigates when any cell in the row is clicked, not just the symbol', async ({ page }) => {
    await page.getByRole('cell', { name: 'Personal Bybit' }).first().click();
    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);
  });

  test('leaves cells directly inspectable, with no overlay across the row', async ({ page }) => {
    // The row used to be covered by a link stretched with after:inset-0, which
    // made every cell impossible to pick in devtools — the pointer always hit
    // the overlay. Whatever is at a cell's centre must be that cell's content.
    // elementFromPoint only answers for points inside the viewport, so the cell
    // is brought into view before it is asked about.
    const cell = page.locator('tbody tr td').nth(4);
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeVisible();

    const owner = await cell.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (hit === null) return 'nothing';
      return hit.closest('td') === element ? 'the cell' : `${hit.tagName}.${hit.className}`;
    });
    expect(owner).toBe('the cell');
  });

  test('opens a new tab on modifier-click, as a link would', async ({ page, context }) => {
    const opened = context.waitForEvent('page');
    await page
      .getByRole('cell', { name: 'Personal Bybit' })
      .first()
      .click({ modifiers: ['Meta'] });

    const tab = await opened;
    await expect(tab).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);
    // The original page stays where it was.
    await expect(page).toHaveURL(/\/trades/);
  });

  test('shows an empty state for a range with no exits', async ({ page }) => {
    await page.goto('/trades?from=2027-01-01&to=2027-01-31');

    await expect(page.getByText('Nothing realized in this range')).toBeVisible();
    await expect(page.getByTestId('period-group')).toHaveCount(0);
  });

  test('lists open positions apart from the realized tables', async ({ page }) => {
    const open = page.getByText('OPEN POSITIONS').locator('..').locator('..');

    // A partially closed position is on risk here *and* realized in its period.
    await expect(open).toContainText('ETHUSDT');
    await expect(open).toContainText('+$58.20');
    await expect(
      page.getByTestId('period-group').filter({ hasText: '12 AUGUST 2026' }),
    ).toContainText('+$58.20');
  });
});
