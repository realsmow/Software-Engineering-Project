# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin\user-lifecycle.spec.ts >> Module 2: Admin User Lifecycle [INT/E2E] >> TP-ADM-E2E-01: loads accounts list via tRPC and renders data table
- Location: tests\e2e\admin\user-lifecycle.spec.ts:22:7

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
```

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/admin/
Received string:  "http://localhost:5173/login"

Call log:
  - Expect "toHaveURL" with timeout 10000ms
    19 × locator resolved to <html lang="en-US">…</html>
       - unexpected value "http://localhost:5173/login"
  - Test timeout of 30000ms exceeded.

```

```yaml
- img "Kasetsart University": KU KASETSART UNIVERSITY
- text: Kasetsart University
- heading "Equipment Lending Management System" [level=1]
- text: ULMs · University Lending Management System For students, faculty, and department staff to borrow and return equipment, lab instruments, and to book laboratory spaces across the faculty. ULMs v1.0 build 20260805 ku.ac.th
- button "Switch language": TH
- button "Dark mode":
  - img
- text: Sign in University account Choose a sign-in method below. Students and faculty should use their KU email; staff without a KU email should use a local account.
- button "KU KU email For students & faculty · @ku.ac.th, @ku.th":
  - text: KU KU email For students & faculty · @ku.ac.th, @ku.th
  - img
- button "Local account For department staff · clubs · Local login" [expanded]:
  - img
  - text: Local account For department staff · clubs · Local login
  - img
- text: Username
- textbox "Username":
  - /placeholder: Username assigned by your administrator
  - text: test_admin
- text: Password
- textbox "Password": admin1234
- button "Show"
- checkbox "Remember me" [checked]
- text: Remember me
- link "Contact admin":
  - /url: "#"
- alert: Incorrect username or password
- button "Sign in with local account"
- link "Terms of use":
  - /url: "#"
- link "Privacy policy":
  - /url: "#"
- link "Contact support":
  - /url: "#"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Module 2: Admin User Lifecycle [INT/E2E]', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     // 1. Authenticate as Administrator via local-account accordion
  6   |     await page.goto('/login');
  7   | 
  8   |     // The login page defaults to KU-email accordion open.
  9   |     // Expand the local-account panel so #loc-user / #loc-pass are visible.
  10  |     await page.click('#m-local .login-method-header');
  11  |     await page.fill('#loc-user', 'test_admin');
  12  |     await page.fill('#loc-pass', 'admin1234');
  13  |     await page.click('#m-local button[type="submit"]');
  14  | 
  15  |     // 2. Wait for session restore and navigation to admin dashboard
> 16  |     await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
      |                        ^ Error: expect(page).toHaveURL(expected) failed
  17  |     await page.goto('/admin/users');
  18  |     await page.waitForLoadState('networkidle');
  19  |   });
  20  | 
  21  |   // ── TP-ADM-E2E-01: Page Load & Multi-Page Account Fetching via tRPC ───────────
  22  |   test('TP-ADM-E2E-01: loads accounts list via tRPC and renders data table', async ({ page }) => {
  23  |     // Assert page header — actual UI text is "System users"
  24  |     await expect(page.locator('h1')).toContainText(/System users/i);
  25  | 
  26  |     // Table rows should render
  27  |     const rows = page.locator('table tbody tr');
  28  |     await expect(rows.first()).toBeVisible();
  29  |     const count = await rows.count();
  30  |     expect(count).toBeGreaterThan(0);
  31  |   });
  32  | 
  33  |   // ── TP-ADM-E2E-02: End-to-End User Creation & Temp Password Modal ─────────────
  34  |   test('TP-ADM-E2E-02: creates a user and displays temporary password modal', async ({ page }) => {
  35  |     const timestamp = Date.now();
  36  |     const testEmail = `e2e.user.${timestamp}@ku.th`;
  37  |     const testName = `E2E TestUser ${timestamp.toString().slice(-4)}`;
  38  | 
  39  |     // Click "Create account" button (actual UI text)
  40  |     await page.click('button:has-text("Create account")');
  41  | 
  42  |     // Fill form inside dialog
  43  |     const dialog = page.locator('[role="dialog"]');
  44  |     await expect(dialog).toBeVisible();
  45  | 
  46  |     // Full name field
  47  |     await dialog.locator('input').first().fill(testName);
  48  | 
  49  |     // Email field — placeholder is "name@ku.th"
  50  |     await dialog.locator('input[type="email"]').fill(testEmail);
  51  | 
  52  |     // Submit form — button text is "Create account"
  53  |     await dialog.locator('button:has-text("Create account")').click();
  54  | 
  55  |     // The create flow should complete — either show a temp password notice or
  56  |     // the new user appears in the table.
  57  |     // Wait for dialog to close or a success indication
  58  |     await page.waitForTimeout(2000);
  59  | 
  60  |     // Verify newly created user appears in table by searching
  61  |     const searchInput = page.locator('input[placeholder="Search..."]');
  62  |     await searchInput.fill(testEmail);
  63  |     await page.waitForTimeout(1000);
  64  | 
  65  |     await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 5000 });
  66  |   });
  67  | 
  68  |   // ── TP-ADM-E2E-03: Role Modification via SlideOver Detail Panel ────────────────
  69  |   test('TP-ADM-E2E-03: modifies user role from slide-over panel and updates', async ({ page }) => {
  70  |     // Click on a non-admin user row to open the slide-over detail panel
  71  |     // The table rows are clickable — clicking opens a SlideOver
  72  |     const userRow = page.locator('table tbody tr', { hasText: 'Borrower' }).first();
  73  |     await expect(userRow).toBeVisible();
  74  |     await userRow.click();
  75  | 
  76  |     // The SlideOver should open with user details
  77  |     // It contains a "Change role" select dropdown
  78  |     const roleSelect = page.locator('button[role="combobox"]').last();
  79  |     await expect(roleSelect).toBeVisible({ timeout: 5000 });
  80  |     await roleSelect.click();
  81  | 
  82  |     // Select "Staff" role
  83  |     await page.click('[role="option"]:has-text("Staff")');
  84  | 
  85  |     // Wait for the mutation to complete
  86  |     await page.waitForTimeout(1000);
  87  | 
  88  |     // Verify the role dropdown now reflects the updated "Staff" role
  89  |     const updatedRoleDisplay = page.locator('button[role="combobox"]').last();
  90  |     await expect(updatedRoleDisplay).toContainText('Staff', { timeout: 5000 });
  91  | 
  92  |     // Teardown/Isolation: Restore the role back to "Borrower" to avoid depleting seed accounts
  93  |     await updatedRoleDisplay.click();
  94  |     await page.click('[role="option"]:has-text("Borrower")');
  95  |     await page.waitForTimeout(1000);
  96  |   });
  97  | 
  98  |   // ── TP-ADM-E2E-04: Password Reset Flow & Generated Dialog ─────────────────────
  99  |   test('TP-ADM-E2E-04: triggers password reset and receives one-time password', async ({ page }) => {
  100 |     // Click on a non-admin user row to open the slide-over
  101 |     const userRow = page.locator('table tbody tr', { hasText: 'Borrower' }).first();
  102 |     await expect(userRow).toBeVisible();
  103 |     await userRow.click();
  104 | 
  105 |     // Click "Reset password" button inside the slide-over
  106 |     const resetBtn = page.locator('button:has-text("Reset password")');
  107 |     await expect(resetBtn).toBeVisible({ timeout: 5000 });
  108 |     await resetBtn.click();
  109 | 
  110 |     // A temporary password notice should appear
  111 |     await expect(page.locator('text=Temporary password')).toBeVisible({ timeout: 5000 });
  112 |   });
  113 | });
  114 | 
```