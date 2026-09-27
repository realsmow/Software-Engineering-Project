import { expect, test } from '../fixtures/api-contracts';
import type { Page } from '@playwright/test';

const ADMIN = { username: 'test_admin', password: 'admin1234' };
const ADMIN_EMAIL = 'admin@ku.th';

async function signInAsAdmin(page: Page) {
  // E2E assertions use a controlled locale, not the browser's host locale.
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

async function openAccount(page: Page, email: string) {
  const row = rowFor(page, email);
  await expect(row).toBeVisible();
  await row.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toContainText(email);
  return panel;
}

async function closePanel(page: Page) {
  const panel = page.getByRole('dialog');
  if (await panel.isVisible().catch(() => false)) {
    // The sheet has an icon close control as well as this footer action.
    await panel.getByRole('button', { name: 'Close', exact: true }).first().click();
    await expect(panel).toBeHidden();
  }
}

test.describe('Admin self-modification guard', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test('TP-ADM-E2E-07: blocks an administrator from disabling or demoting themself', async ({ page }) => {
    const search = page.getByRole('textbox', { name: 'Search', exact: true });
    await search.fill(ADMIN_EMAIL);
    const panel = await openAccount(page, ADMIN_EMAIL);

    await panel.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect(panel.getByText('CANNOT_MODIFY_SELF')).toBeVisible();

    const roleSelect = panel.getByRole('combobox');
    await roleSelect.click();
    await page.getByRole('option', { name: 'Borrower', exact: true }).click();
    await expect(panel.getByText('CANNOT_MODIFY_SELF')).toBeVisible();
    await expect(roleSelect).toContainText('System administrator');

    await closePanel(page);
    await expect(rowFor(page, ADMIN_EMAIL)).toContainText('System administrator');
    await expect(rowFor(page, ADMIN_EMAIL)).toContainText('Active');
  });
});
