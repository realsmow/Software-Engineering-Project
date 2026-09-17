import { expect, test, type Page } from "@playwright/test";

const BORROWER = { username: "test_borrower", password: "borrower1234" };
const CALIPER = "เวอร์เนียคาลิปเปอร์ดิจิทัล";
const JUMPER_WIRES = "สายจัมเปอร์ชุดใหญ่";

/**
 * Keep this E2E window away from same-day/manual QA reservations.  It remains
 * inside the 90-day booking horizon and does not depend on the current time.
 */
function e2eRequestDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 31);
  return date.toISOString().slice(0, 10);
}

async function signInAsBorrower(page: Page) {
  // Test text and labels are stable regardless of the machine's locale.
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(BORROWER.username);
  await page.locator("#loc-pass").fill(BORROWER.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
}

async function addSeedT0Items(page: Page) {
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Equipment catalog" })).toBeVisible();

  for (const itemName of [CALIPER, JUMPER_WIRES]) {
    // `hasText` belongs to Locator.filter(), not getByRole() options.  Filtering
    // after selecting rows avoids matching the table header and loading row.
    const row = page.getByRole("row").filter({ hasText: itemName });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Add" }).click();
  }

  await page.getByRole("button", { name: "2 selected", exact: true }).click();
  await expect(page).toHaveURL("/request");
}

function mutationResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname.split("/trpc/")[1]?.split(",");
    return procedures?.includes(procedure) === true && response.request().method() === "POST";
  });
}

/** Remove the reservation the happy-path test created, leaving the seed DB reusable. */
async function cancelLatestRequest(page: Page, itemName: string) {
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: itemName, exact: true }) })
    .first();
  await card.getByRole("button", { name: "Cancel request" }).click();
  const cancel = mutationResponse(page, "loan.cancel");
  await page.getByRole("button", { name: "Yes, cancel request" }).click();
  expect((await cancel).ok()).toBeTruthy();
}

test.describe("Module 6 loan request submission", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsBorrower(page);
  });

  test("6.1–6.2: keeps submit disabled until a valid return date is selected", async ({ page }) => {
    await addSeedT0Items(page);

    const submit = page.getByRole("button", { name: "Submit request" });
    await expect(submit).toBeDisabled();

    await page.getByLabel("Pickup date").fill(e2eRequestDate());
    await page.getByLabel("Return date").fill(e2eRequestDate());
    await page.getByRole("button", { name: "13:00" }).first().click();
    await expect(submit).toBeEnabled();
  });

  test("6.1 & 6.11: submits two T0 items through loan.create", async ({ page }) => {
    await addSeedT0Items(page);

    await page.getByLabel("Pickup date").fill(e2eRequestDate());
    await page.getByLabel("Return date").fill(e2eRequestDate());
    // 13:00 is safely after the default 08:00 pickup time.
    await page.getByRole("button", { name: "13:00" }).first().click();

    const create = mutationResponse(page, "loan.create");
    await page.getByRole("button", { name: "Submit request" }).click();

    expect((await create).ok()).toBeTruthy();
    await expect(page).toHaveURL("/my/loans");
    await expect(page.getByRole("heading", { name: CALIPER, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: JUMPER_WIRES, exact: true }).first()).toBeVisible();

    await cancelLatestRequest(page, CALIPER);
    await cancelLatestRequest(page, JUMPER_WIRES);
  });
});
