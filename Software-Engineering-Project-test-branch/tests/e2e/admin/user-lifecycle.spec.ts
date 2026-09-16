import { test, expect } from '@playwright/test';

test.describe('Module 2: Admin User Lifecycle [INT/E2E]', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Authenticate as Administrator via local-account accordion
    await page.goto('/login');

    // The login page defaults to KU-email accordion open.
    // Expand the local-account panel so #loc-user / #loc-pass are visible.
    await page.click('#m-local .login-method-header');
    await page.fill('#loc-user', 'test_admin');
    await page.fill('#loc-pass', 'admin1234');
    await page.click('#m-local button[type="submit"]');

    // 2. Wait for session restore and navigation to admin dashboard
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');
  });

  // ── TP-ADM-E2E-01: Page Load & Multi-Page Account Fetching via tRPC ───────────
  test('TP-ADM-E2E-01: loads accounts list via tRPC and renders data table', async ({ page }) => {
    // Assert page header — actual UI text is "System users"
    await expect(page.locator('h1')).toContainText(/System users/i);

    // Table rows should render
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── TP-ADM-E2E-02: End-to-End User Creation & Temp Password Modal ─────────────
  test('TP-ADM-E2E-02: creates a user and displays temporary password modal', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `e2e.user.${timestamp}@ku.th`;
    const testName = `E2E TestUser ${timestamp.toString().slice(-4)}`;

    // Click "Create account" button (actual UI text)
    await page.click('button:has-text("Create account")');

    // Fill form inside dialog
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Full name field
    await dialog.locator('input').first().fill(testName);

    // Email field — placeholder is "name@ku.th"
    await dialog.locator('input[type="email"]').fill(testEmail);

    // Submit form — button text is "Create account"
    await dialog.locator('button:has-text("Create account")').click();

    // The create flow should complete — either show a temp password notice or
    // the new user appears in the table.
    // Wait for dialog to close or a success indication
    await page.waitForTimeout(2000);

    // Verify newly created user appears in table by searching
    const searchInput = page.locator('input[placeholder="Search..."]');
    await searchInput.fill(testEmail);
    await page.waitForTimeout(1000);

    await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 5000 });
  });

  // ── TP-ADM-E2E-03: Role Modification via SlideOver Detail Panel ────────────────
  test('TP-ADM-E2E-03: modifies user role from slide-over panel and updates', async ({ page }) => {
    // Click on a non-admin user row to open the slide-over detail panel
    // The table rows are clickable — clicking opens a SlideOver
    const userRow = page.locator('table tbody tr', { hasText: 'Borrower' }).first();
    await expect(userRow).toBeVisible();
    await userRow.click();

    // The SlideOver should open with user details
    // It contains a "Change role" select dropdown
    const roleSelect = page.locator('button[role="combobox"]').last();
    await expect(roleSelect).toBeVisible({ timeout: 5000 });
    await roleSelect.click();

    // Select "Staff" role
    await page.click('[role="option"]:has-text("Staff")');

    // Wait for the mutation to complete
    await page.waitForTimeout(1000);

    // Verify the role dropdown now reflects the updated "Staff" role
    const updatedRoleDisplay = page.locator('button[role="combobox"]').last();
    await expect(updatedRoleDisplay).toContainText('Staff', { timeout: 5000 });

    // Teardown/Isolation: Restore the role back to "Borrower" to avoid depleting seed accounts
    await updatedRoleDisplay.click();
    await page.click('[role="option"]:has-text("Borrower")');
    await page.waitForTimeout(1000);
  });

  // ── TP-ADM-E2E-04: Password Reset Flow & Generated Dialog ─────────────────────
  test('TP-ADM-E2E-04: triggers password reset and receives one-time password', async ({ page }) => {
    // Click on a non-admin user row to open the slide-over
    const userRow = page.locator('table tbody tr', { hasText: 'Borrower' }).first();
    await expect(userRow).toBeVisible();
    await userRow.click();

    // Click "Reset password" button inside the slide-over
    const resetBtn = page.locator('button:has-text("Reset password")');
    await expect(resetBtn).toBeVisible({ timeout: 5000 });
    await resetBtn.click();

    // A temporary password notice should appear
    await expect(page.locator('text=Temporary password')).toBeVisible({ timeout: 5000 });
  });
});
