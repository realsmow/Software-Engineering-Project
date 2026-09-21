import { expect, test, type Page } from "@playwright/test";

const BORROWER = { username: "test_borrower", password: "borrower1234" };
const CALIPER = "เวอร์เนียคาลิปเปอร์ดิจิทัล";
const JUMPER_WIRES = "สายจัมเปอร์ชุดใหญ่";

function e2eRequestDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 31);
  return date.toISOString().slice(0, 10);
}

function e2eReturnDate(daysFromPickup: number): string {
  const date = new Date(`${e2eRequestDate()}T00:00:00`);
  date.setDate(date.getDate() + daysFromPickup);
  return date.toISOString().slice(0, 10);
}

async function signInAsBorrower(page: Page) {
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

  test("6.1: adds two items and opens one combined request draft", async ({ page }) => {
    await addSeedT0Items(page);

    await expect(page.getByRole("heading", { name: CALIPER, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: JUMPER_WIRES, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit request" })).toBeDisabled();
  });

  test("6.2: requires a valid pickup/return period within the allowed range", async ({ page }) => {
    await addSeedT0Items(page);

    const submit = page.getByRole("button", { name: "Submit request" });
    await expect(submit).toBeDisabled();

    await page.getByLabel("Pickup date").fill(e2eRequestDate());
    await page.getByLabel("Return date").fill(e2eReturnDate(14));
    await page.getByRole("button", { name: "13:00" }).first().click();
    await expect(submit).toBeEnabled();

    // A 15-day span exceeds the default D0 allowance of 14 days.
    await page.getByLabel("Return date").fill(e2eReturnDate(15));
    await expect(submit).toBeDisabled();
  });

  test("6.11: submits the request through loan.create and shows both requested items", async ({ page }) => {
    await addSeedT0Items(page);

    await page.getByLabel("Pickup date").fill(e2eRequestDate());
    await page.getByLabel("Return date").fill(e2eReturnDate(1));
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
