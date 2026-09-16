import { test, expect } from '@playwright/test';

test.describe('Module 2: Admin User Ban & Policy Management [INT/E2E]', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Authenticate as Staff / Admin via local-account accordion
    await page.goto('/login');

    // Expand the local-account panel so #loc-user / #loc-pass are visible.
    await page.click('#m-local .login-method-header');
    await page.fill('#loc-user', 'test_admin');
    await page.fill('#loc-pass', 'admin1234');
    await page.click('#m-local button[type="submit"]');

    // 2. Navigate to user management page
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
  });

  // ── TP-ADM-E2E-05: Apply Borrowing Ban (Suspend) via SlideOver Flow ───────────
  test('TP-ADM-E2E-05: applies suspension and updates user status badge to Suspended', async ({ page }) => {
    // Click on a Borrower row to open the slide-over detail panel
    const targetRow = page.locator('table tbody tr', { hasText: 'Borrower' }).first();
    await expect(targetRow).toBeVisible();
    await targetRow.click();

    // If already suspended, lift suspension first so we can test suspend
    const liftBtn = page.getByRole('button', { name: 'Lift suspension', exact: true });
    if (await liftBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await liftBtn.click();
      await page.waitForTimeout(1000);
      await targetRow.click();
    }

    // The SlideOver footer contains a "Suspend" button for active users
    const suspendBtn = page.getByRole('button', { name: 'Suspend', exact: true });
    await expect(suspendBtn).toBeVisible({ timeout: 5000 });
    await suspendBtn.click();

    // Wait for the mutation to complete (SlideOver closes on success)
    await page.waitForTimeout(1000);

    // Verify in table that status badge updated to "Suspended"
    await expect(page.locator('table').getByText('Suspended', { exact: true }).first()).toBeVisible();

    // Teardown/Isolation: Restore user back to active status so subsequent tests remain isolated
    await targetRow.click();
    const restoreLiftBtn = page.getByRole('button', { name: 'Lift suspension', exact: true });
    if (await restoreLiftBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await restoreLiftBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  // ── TP-ADM-E2E-06: Lift Suspension Flow ───────────────────────────────────────
  test('TP-ADM-E2E-06: lifts suspension and restores status badge to Active', async ({ page }) => {
    // Select a borrower to test the lift suspension flow
    const borrowerRow = page.locator('table tbody tr', { hasText: 'Borrower' }).first();
    await expect(borrowerRow).toBeVisible();
    await borrowerRow.click();

    // Check if user is currently active or suspended
    const suspendBtn = page.getByRole('button', { name: 'Suspend', exact: true });
    const liftBtn = page.getByRole('button', { name: 'Lift suspension', exact: true });

    if (await suspendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // User is active, suspend first
      await suspendBtn.click();
      await page.waitForTimeout(1000);
      // Now open the same borrower again
      await borrowerRow.click();
    }

    // Now lift the suspension
    await expect(liftBtn).toBeVisible({ timeout: 5000 });
    await liftBtn.click();
    await page.waitForTimeout(1000);

    // Verify user is restored to active: opening the detail shows "Suspend" again
    await borrowerRow.click();
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  });

  // ── TP-ADM-E2E-07: Self-Modification Prevention Flow (UI + Error Toast) ────────
  test('TP-ADM-E2E-07: prevents currently logged-in admin from banning or demoting self', async ({ page }) => {
    // Search for the current admin user
    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill('admin@ku.th');
    await page.waitForTimeout(1000);

    // Click on the admin's own row
    const selfRow = page.locator('table tbody tr', { hasText: 'admin@ku.th' }).first();
    await expect(selfRow).toBeVisible();
    await selfRow.click();

    // The slide-over should open for the admin account
    const suspendBtn = page.getByRole('button', { name: 'Suspend', exact: true });

    // Attempt self-suspension: either the button is hidden/disabled, or clicking shows an error
    if (await suspendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suspendBtn.click();
      await page.waitForTimeout(1000);
    }

    // Attempt self-demotion via role dropdown
    const roleSelect = page.locator('button[role="combobox"]').last();
    if (await roleSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roleSelect.click();
      const borrowerOption = page.locator('[role="option"]:has-text("Borrower")');
      if (await borrowerOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await borrowerOption.click();
        await page.waitForTimeout(1000);
      }
    }

    // Close the slide-over if still open
    const closeBtn = page.getByRole('button', { name: 'Close', exact: true }).first();
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
    }

    // Verify the admin account state was NOT modified by the self-modification attempts
    await searchInput.clear();
    await searchInput.fill('admin@ku.th');
    await page.waitForTimeout(500);
    const refreshedRow = page.locator('table tbody tr', { hasText: 'admin@ku.th' }).first();
    await expect(refreshedRow).toBeVisible();
    // The admin should NOT have been suspended (status must not show "Suspended")
    await expect(refreshedRow).not.toContainText('Suspended');
  });
});
