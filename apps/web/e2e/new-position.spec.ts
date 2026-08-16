import { expect, test, type Page } from '@playwright/test';

/**
 * The behaviours that only exist in a browser: the live preview, and the fact
 * that what it shows is exactly what the server stores. Everything else is
 * covered by unit and API tests.
 */

const SPEC_EXAMPLE = {
  // Every symbol these tests create starts with E2E so global teardown can
  // find and remove them. A realistic symbol would be indistinguishable from
  // seeded data and would quietly accumulate in the journal.
  symbol: 'E2ESPEC',
  openedAt: '2026-08-15T10:31',
  entryPrice: '117500',
  quantity: '0.1',
  initialStopPrice: '115000',
  closedAt: '2026-08-15T15:42',
  exitPrice: '120000',
  fees: '8.24',
};

async function fillPosition(page: Page, values: Partial<typeof SPEC_EXAMPLE> = {}) {
  const data = { ...SPEC_EXAMPLE, ...values };
  await page.getByLabel('Symbol').fill(data.symbol);
  await page.getByLabel('Initial stop').fill(data.initialStopPrice);

  await page.getByLabel('Entry 1 price').fill(data.entryPrice);
  await page.getByLabel('Entry 1 quantity').fill(data.quantity);
  await page.getByLabel('Entry 1 time').fill(data.openedAt);

  if (data.exitPrice === '') {
    // An exit row left blank is simply a position that is still open.
    return;
  }
  await page.getByLabel('Exit 1 price').fill(data.exitPrice);
  await page.getByLabel('Exit 1 quantity').fill(data.quantity);
  await page.getByLabel('Exit 1 time').fill(data.closedAt);
  await page.getByLabel('Exit 1 fee').fill(data.fees);
}

test.describe('New Position', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/positions/new');
  });

  test('previews the spec’s worked example before saving', async ({ page }) => {
    await fillPosition(page);

    const preview = page.getByTestId('preview');
    await expect(preview).toContainText('+$241.76');
    await expect(preview).toContainText('+0.24%');
    await expect(preview).toContainText('+0.97R');
    await expect(preview).toContainText('Closed');
    // Risk is a magnitude, not an outcome — it carries no plus sign.
    await expect(page.getByTestId('risk-summary')).toContainText('$250.00');
  });

  test('shows no R when no stop is recorded, rather than 0R', async ({ page }) => {
    await fillPosition(page, { initialStopPrice: '' });

    const preview = page.getByTestId('preview');
    await expect(preview).toContainText('+$241.76');
    await expect(preview).toContainText('—');
    await expect(preview).not.toContainText('0.00R');
  });

  test('reports a stop on the wrong side and blocks saving', async ({ page }) => {
    // A long stop above the entry would imply negative risk.
    await fillPosition(page, { initialStopPrice: '119000' });

    await expect(page.getByText('A long stop must be below the first entry price.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save position' })).toBeDisabled();
  });

  test('treats a position with no exit as open', async ({ page }) => {
    await fillPosition(page, { exitPrice: '' });

    const preview = page.getByTestId('preview');
    await expect(preview).toContainText('Open');
    await expect(preview).toContainText('$0.00');
  });

  test('saves and lands on a detail page showing the same figures', async ({ page }) => {
    await fillPosition(page, { symbol: 'E2EBTC' });
    await page.getByRole('button', { name: 'Save position' }).click();

    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);

    // The server recalculated from the raw executions and agreed with the preview.
    const headline = page.getByTestId('position-headline');
    await expect(headline).toContainText('+$241.76');
    await expect(headline).toContainText('+0.97R');
    await expect(page.getByRole('heading', { name: 'E2EBTC' })).toBeVisible();

    // The wall-clock time the trader typed survives the round trip. It appears
    // both in the summary and on the execution row, which is correct.
    await expect(page.getByText('15 Aug 2026, 10:31').first()).toBeVisible();
    await expect(page.getByText('15 Aug 2026, 15:42').first()).toBeVisible();
    await expect(page.getByText('5h 11m')).toBeVisible();
  });

  test('pre-fills the edit form and updates on save', async ({ page }) => {
    await fillPosition(page, { symbol: 'E2EEDIT' });
    await page.getByRole('button', { name: 'Save position' }).click();
    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/edit$/);

    // Values come back as the trader entered them, in the reporting timezone.
    await expect(page.getByLabel('Symbol')).toHaveValue('E2EEDIT');
    await expect(page.getByLabel('Entry 1 price')).toHaveValue('117500');
    await expect(page.getByLabel('Entry 1 time')).toHaveValue('2026-08-15T10:31');
    await expect(page.getByLabel('Initial stop')).toHaveValue('115000');

    await page.getByLabel('Exit 1 price').fill('121000');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);

    // (121000 - 117500) * 0.1 - 8.24 = 341.76
    await expect(page.getByTestId('position-headline')).toContainText('+$341.76');
  });

  test('deletes a position after confirming', async ({ page }) => {
    await fillPosition(page, { symbol: 'E2EDEL' });
    await page.getByRole('button', { name: 'Save position' }).click();
    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);
    const detailUrl = page.url();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Delete E2EDEL?');
    await page.getByRole('button', { name: 'Delete position' }).click();

    await expect(page).toHaveURL(/\/trades$/);

    // It is gone from the journal, though its executions survive in the database.
    const response = await page.goto(detailUrl);
    expect(response?.status()).toBe(404);
  });
});

test.describe('Scaled positions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/positions/new');
  });

  test('previews a position scaled in and out across four executions', async ({ page }) => {
    // The spec's own example: 1 position, 4 executions.
    await page.getByLabel('Symbol').fill('E2ESCALE');

    await page.getByLabel('Entry 1 price').fill('100000');
    await page.getByLabel('Entry 1 quantity').fill('0.5');
    await page.getByLabel('Entry 1 time').fill('2026-08-15T10:31');

    await page.getByRole('button', { name: 'Add entry' }).click();
    await page.getByLabel('Entry 2 price').fill('101000');
    await page.getByLabel('Entry 2 quantity').fill('0.25');
    await page.getByLabel('Entry 2 time').fill('2026-08-15T11:04');

    await page.getByLabel('Exit 1 price').fill('103000');
    await page.getByLabel('Exit 1 quantity').fill('0.25');
    await page.getByLabel('Exit 1 time').fill('2026-08-15T14:12');

    await page.getByRole('button', { name: 'Add exit' }).click();
    await page.getByLabel('Exit 2 price').fill('105000');
    await page.getByLabel('Exit 2 quantity').fill('0.5');
    await page.getByLabel('Exit 2 time').fill('2026-08-15T16:42');

    const preview = page.getByTestId('preview');
    await expect(preview).toContainText('Closed');
    // Weighted-average basis of 100,333.33… against 78,250 of exits.
    await expect(preview).toContainText('+$3,000.00');
    await expect(page.getByTestId('risk-summary')).toContainText('0.75');
  });

  test('reports overselling as the rows are entered', async ({ page }) => {
    await page.getByLabel('Symbol').fill('E2EOVER');
    await page.getByLabel('Entry 1 price').fill('100');
    await page.getByLabel('Entry 1 quantity').fill('1');
    await page.getByLabel('Entry 1 time').fill('2026-08-15T10:00');
    await page.getByLabel('Exit 1 price').fill('110');
    await page.getByLabel('Exit 1 quantity').fill('2');
    await page.getByLabel('Exit 1 time').fill('2026-08-15T11:00');

    await expect(page.getByText(/Exit quantity exceeds/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save position' })).toBeDisabled();
  });

  test('saves a partial exit as an open position', async ({ page }) => {
    await page.getByLabel('Symbol').fill('E2EPARTIAL');
    await page.getByLabel('Initial stop').fill('90');
    await page.getByLabel('Entry 1 price').fill('100');
    await page.getByLabel('Entry 1 quantity').fill('1');
    await page.getByLabel('Entry 1 time').fill('2026-08-15T10:00');
    await page.getByLabel('Exit 1 price').fill('110');
    await page.getByLabel('Exit 1 quantity').fill('0.4');
    await page.getByLabel('Exit 1 time').fill('2026-08-15T11:00');

    await page.getByRole('button', { name: 'Save position' }).click();
    await expect(page).toHaveURL(/\/positions\/[0-9a-f-]{36}$/);

    await expect(page.getByTestId('position-headline')).toContainText('+$4.00');
    await expect(page.getByText('0.6 still open')).toBeVisible();
  });

  test('removes an execution row', async ({ page }) => {
    await page.getByRole('button', { name: 'Add entry' }).click();
    await expect(page.getByLabel('Entry 2 price')).toBeVisible();

    await page.getByRole('button', { name: 'Remove entry 2' }).click();
    await expect(page.getByLabel('Entry 2 price')).toBeHidden();

    // The last entry cannot be removed: a position needs at least one.
    await expect(page.getByRole('button', { name: 'Remove entry 1' })).toBeDisabled();
  });
});
