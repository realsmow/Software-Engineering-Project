import { expect, test, type Page } from "@playwright/test";

const ADMIN = { username: "test_admin", password: "admin1234" };

async function signInAsAdmin(page: Page) {
  // Test the English labels, independently of the browser host locale.
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(ADMIN.username);
  await page.locator("#loc-pass").fill(ADMIN.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
}

test.describe("Admin console pages", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("shows the live system overview and links to its operational records", async ({
    page,
  }) => {
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "System overview" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "System users" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Audit log" })).toBeVisible();
  });

  test("shows database status and the scheduled-job register", async ({
    page,
  }) => {
    await page.goto("/admin/status");

    await expect(
      page.getByRole("heading", { name: "System status" }),
    ).toBeVisible();
    await expect(
      page.getByText("Scheduled jobs", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Job" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Run now" }).first(),
    ).toBeVisible();
  });

  test("shows the read-only runtime technical configuration", async ({
    page,
  }) => {
    await page.goto("/admin/config");

    await expect(
      page.getByRole("heading", { name: "Technical config" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Every value below comes from an environment variable/i),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  });

  test("shows audit filtering and export controls", async ({ page }) => {
    await page.goto("/admin/audit");

    await expect(
      page.getByRole("heading", { name: "Audit log" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.locator('input[type="search"]')).toBeVisible();
  });

  test("shows the live consolidated lending report", async ({ page }) => {
    await page.goto("/admin/reports");

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "By department" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Most borrowed" }),
    ).toBeVisible();
  });

  test("renders admin status and config at mobile and desktop viewport sizes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/status");
    await expect(
      page.getByRole("heading", { name: "System status" }),
    ).toBeVisible();
    await expect(
      page.getByText("Scheduled jobs", { exact: true }),
    ).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/config");
    await expect(
      page.getByRole("heading", { name: "Technical config" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  });

  // computeAvailability and rollupDailyStats were removed as jobs entirely
  // (nothing left to precompute), so there is no more "not implemented"
  // placeholder job to press. Every job in the registry now does real work,
  // so pressing Run now should surface a real result badge, not a blank cell.
  test("running a scheduled job surfaces a real result instead of a blank status", async ({
    page,
  }) => {
    await page.goto("/admin/status");
    await expect(page.getByRole("columnheader", { name: "Job" })).toBeVisible();
    const row = page.locator("tbody tr").filter({ hasText: "expireDemerits" });

    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Run now" }).click();
    await expect(row.getByText("Success")).toBeVisible();
    await expect(row).not.toContainText("Error:");
  });
});
