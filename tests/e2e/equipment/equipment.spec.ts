import { expect, test, type Page } from "@playwright/test";

const ADMIN = { username: "test_admin", password: "admin1234" };

async function signInAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(ADMIN.username);
  await page.locator("#loc-pass").fill(ADMIN.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
}

function trpcResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname
      .split("/trpc/")[1]
      ?.split(",");

    return (
      procedures?.includes(procedure) === true &&
      response.request().method() === "GET"
    );
  });
}

test.describe("Module 5 equipment browser flows", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("loads the borrower catalogue through item.list and exposes search/filter controls", async ({
    page,
  }) => {
    const response = trpcResponse(page, "item.list");
    await page.goto("/catalog");

    expect((await response).ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Equipment catalog" }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox").first()).toBeVisible();
    await expect(page.getByText("Tier", { exact: true }).first()).toBeVisible();
  });

  test("loads staff inventory through item.listManaged and supports expanding a type", async ({
    page,
  }) => {
    const response = trpcResponse(page, "item.listManaged");
    await page.goto("/staff/inventory");

    expect((await response).ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Inventory" }),
    ).toBeVisible();
    await expect(page.getByText("Item types")).toBeVisible();

    const viewUnits = page.getByRole("button", { name: /View units/i }).first();
    if (await viewUnits.count()) {
      const detail = trpcResponse(page, "item.getManagedById");
      await viewUnits.click();
      expect((await detail).ok()).toBeTruthy();
    }
  });

  test("opens equipment detail and requests the live availability endpoint", async ({
    page,
  }) => {
    const list = trpcResponse(page, "item.list");
    await page.goto("/catalog");
    expect((await list).ok()).toBeTruthy();

    const details = page.getByRole("button", { name: "Details" }).first();
    test.skip(
      !(await details.count()),
      "Seed database has no equipment type to open.",
    );

    const detail = trpcResponse(page, "item.getById");
    const availability = trpcResponse(page, "item.getAvailability");
    await details.click();
    expect((await detail).ok()).toBeTruthy();
    await expect(page.getByText("Availability, next 14 days")).toBeVisible();
    expect((await availability).ok()).toBeTruthy();
  });
});
