import { expect, test, type Page } from '@playwright/test';

const USERS = {
  staff: { username: 'test_staff', password: 'staff1234', landing: '/staff' },
  supervisor: {
    username: 'test_supervisor',
    password: 'supervisor1234',
    landing: '/supervisor/approvals',
  },
  borrower: { username: 'test_borrower', password: 'borrower1234', landing: '/' },
} as const;

async function signIn(page: Page, role: keyof typeof USERS) {
  const user = USERS[role];
  await page.addInitScript(() => localStorage.setItem('ulms-locale', 'en'));
  await page.goto('/login');
  await page.locator('#m-local .login-method-header').click();
  await page.locator('#loc-user').fill(user.username);
  await page.locator('#loc-pass').fill(user.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(user.landing, {
    timeout: 10_000,
  });
}

function queryResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname.split('/trpc/')[1]?.split(',');
    return procedures?.includes(procedure) === true && response.request().method() === 'GET';
  });
}

test.describe('Staff and supervisor workspaces', () => {
  test('staff loads the live preparation queue and inspection backlog', async ({ page }) => {
    await signIn(page, 'staff');

    const queue = queryResponse(page, 'loan.staffQueue');
    await page.reload();
    expect((await queue).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Queue' })).toBeVisible();

    const inspections = queryResponse(page, 'inspection.list');
    await page.goto('/staff/inspection');
    expect((await inspections).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Inspection' })).toBeVisible();
  });

  test('supervisor loads their approval and extension queues from the backend', async ({ page }) => {
    await signIn(page, 'supervisor');

    const approvals = queryResponse(page, 'approval.queue');
    const extensions = queryResponse(page, 'approval.extensionQueue');
    await page.reload();
    expect((await approvals).ok()).toBeTruthy();
    expect((await extensions).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible();
  });

  test('borrower opens notifications from the live notification endpoint', async ({ page }) => {
    await signIn(page, 'borrower');

    const notifications = queryResponse(page, 'notification.list');
    await page.locator('button[title="Notifications"]').click();
    expect((await notifications).ok()).toBeTruthy();
    await expect(page.getByText('Notifications', { exact: true }).last()).toBeVisible();
  });
});
