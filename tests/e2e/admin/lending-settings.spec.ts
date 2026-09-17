import { expect, test, type Page } from '@playwright/test';

const ADMIN = { username: 'test_admin', password: 'admin1234' };
const STAFF = { username: 'test_staff', password: 'staff1234' };
const BORROWER = { username: 'test_borrower', password: 'borrower1234' };

async function signIn(
  page: Page,
  credentials: { username: string; password: string },
  landing: RegExp,
) {
  await page.addInitScript(() => localStorage.setItem('ulms-locale', 'en'));
  await page.goto('/login');
  await page.locator('#m-local .login-method-header').click();
  await page.locator('#loc-user').fill(credentials.username);
  await page.locator('#loc-pass').fill(credentials.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(landing, { timeout: 10_000 });
}

async function editAndRestoreOneSetting(page: Page) {
  await page.goto('/staff/settings');
  await expect(page).toHaveURL(/\/staff\/settings$/);
  await expect(page.getByRole('heading', { name: 'Lending settings' })).toBeVisible();

  const field = page.getByRole('spinbutton').first();
  await expect(field).toBeVisible();
  const original = Number(await field.inputValue());
  const changed = original === 365 ? 364 : original + 1;
  const save = page.getByRole('button', { name: 'Save this rule' }).first();

  try {
    await field.fill(String(changed));
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole('status')).toContainText('Saved');
  } finally {
    // Restore the seeded value so this integration test is safe to repeat.
    await field.fill(String(original));
    await save.click();
    await expect(page.getByRole('status')).toContainText('Saved');
  }
}

test.describe('Lending settings access and save', () => {
  test('Admin can read and save lending settings', async ({ page }) => {
    await signIn(page, ADMIN, /\/admin$/);
    await editAndRestoreOneSetting(page);
  });

  test('Staff can read and save lending settings', async ({ page }) => {
    await signIn(page, STAFF, /\/staff$/);
    await editAndRestoreOneSetting(page);
  });

  test('Borrower is redirected away from lending settings', async ({ page }) => {
    await signIn(page, BORROWER, /\/$/);
    await page.goto('/staff/settings');
    await expect(page).not.toHaveURL(/\/staff\/settings$/);
  });
});
