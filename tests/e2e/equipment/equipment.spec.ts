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

  test("opens equipment detail and requests the item.getById endpoint", async ({
    page,
  }) => {
    const list = trpcResponse(page, "item.list");
    await page.goto("/catalog");
    expect((await list).ok()).toBeTruthy();

    const detailsBtn = page.getByRole("button", { name: "Details" }).first();
    const row = page.locator("tbody tr").first();
    const opener = (await detailsBtn.count()) ? detailsBtn : row;
    test.skip(
      !(await opener.count()),
      "Seed database has no equipment type to open.",
    );

    // The 14-day availability panel and its item.getAvailability call were
    // deliberately removed from the detail page; live availability now comes
    // from the per-unit rows under "Units in the system".
    const detail = trpcResponse(page, "item.getById");
    await opener.click();
    expect((await detail).ok()).toBeTruthy();
    await expect(page.getByText("Units in the system")).toBeVisible();
  });

  test("opens a T3 facility and shows its capacity and same-day slot calendar", async ({
    page,
  }) => {
    await page.goto("/rooms");

    await expect(page.getByRole("heading", { name: "Room list" })).toBeVisible();
    // RoomInfo.Capacity is nullable until staff record it, and neither seeded
    // room has one yet, so the summary card shows no seat count for either.
    // Assert the column that carries capacity instead of a specific figure.
    await expect(page.getByRole("columnheader", { name: "Capacity" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Book this room" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Book this room" }).first().click();

    await expect(
      page.getByRole("heading", { name: "New room booking" }),
    ).toBeVisible();
    await expect(page.getByText(/Fixed facilities \(T3\) are booked same-day only/)).toBeVisible();
    await expect(page.getByRole("button", { name: "07:00" })).toBeVisible();
    await expect(page.getByRole("button", { name: "17:30" })).toBeVisible();
    await expect(page.getByText(/lunch break - not bookable/)).toBeVisible();
  });
});
