import { expect, test, type Page } from '@playwright/test';

const ADMIN = { username: 'test_admin', password: 'admin1234' };
const BORROWER = { username: 'test_borrower', password: 'borrower1234' };
const BORROWER_EMAIL = 'borrower@ku.th';

async function signInAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem('ulms-locale', 'en'));
  await page.goto('/login');
  await page.locator('#m-local .login-method-header').click();
  await page.locator('#loc-user').fill(ADMIN.username);
  await page.locator('#loc-pass').fill(ADMIN.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
  await page.goto('/admin/users');
  await expect(page.locator('table tbody tr').first()).toBeVisible();
}

function rowFor(page: Page, email: string) {
  return page.locator('table tbody tr', { hasText: email }).first();
}

async function openBorrower(page: Page) {
  const row = rowFor(page, BORROWER_EMAIL);
  await expect(row).toBeVisible();
  await row.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText(BORROWER_EMAIL);
  return panel;
}

async function restoreBorrowerRole(page: Page) {
  // Role changes leave the detail sheet open. Reuse it during cleanup instead
  // of trying to click a table row behind its modal overlay.
  let panel = page.getByRole('dialog');
  if (!(await panel.isVisible().catch(() => false))) {
    panel = await openBorrower(page);
  }
  const roleSelect = panel.getByRole('combobox');
  if (await roleSelect.textContent().then((text) => !text?.includes('Borrower'))) {
    await roleSelect.click();
    await page.getByRole('option', { name: 'Borrower', exact: true }).click();
    await expect(roleSelect).toContainText('Borrower');
  }
  // The sheet has an icon close control as well as this footer action.
  await panel.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(panel).toBeHidden();
}

test.describe('Admin user lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('TP-ADM-E2E-01: loads a non-empty account table for an authenticated administrator', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'System users' })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('TP-ADM-E2E-02: validates the account-creation form without leaving persistent test data', async ({ page }) => {
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'Create account', exact: true });
    await expect(submit).toBeDisabled();

    await dialog.getByPlaceholder('First name – last name').fill('E2E Test User');
    await dialog.getByPlaceholder('name@ku.th').fill('e2e.validation@ku.th');
    await expect(submit).toBeEnabled();

    // No delete-account procedure exists, so this deliberately stops before
    // submit instead of permanently polluting the configured E2E database.
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('TP-ADM-E2E-03: changes a borrower role and restores the seed role', async ({ page }) => {
    await restoreBorrowerRole(page);

    try {
      const panel = await openBorrower(page);
      const roleSelect = panel.getByRole('combobox');
      await roleSelect.click();
      await page.getByRole('option', { name: 'Staff', exact: true }).click();
      await expect(roleSelect).toContainText('Staff');
      await expect(rowFor(page, BORROWER_EMAIL)).toContainText('Staff');
    } finally {
      await restoreBorrowerRole(page);
    }
  });

  test('TP-ADM-E2E-04: exposes password reset for a selected non-admin account', async ({ page }) => {
    const panel = await openBorrower(page);
    await expect(panel.getByRole('button', { name: 'Reset password', exact: true })).toBeEnabled();
    await panel.getByRole('button', { name: 'Close', exact: true }).first().click();
  });

  test('redirects a borrower away from the admin user-management route', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#m-local .login-method-header').click();
    await page.locator('#loc-user').fill(BORROWER.username);
    await page.locator('#loc-pass').fill(BORROWER.password);
    await page.locator('#m-local button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/admin\/users/);
    await expect(page.getByRole('heading', { name: 'System users' })).toHaveCount(0);
  });
});
