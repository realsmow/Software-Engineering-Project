import {
  addDays,
  localTimeToUtc,
  toLocalDayKey,
} from "../../backend/src/common/schemas/datetime.schema";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/api-contracts";
import { loginOutput } from "../../backend/src/auth/auth.schema";
import { createRequestOutput } from "../../backend/src/loan/loan.schema";

const BORROWER = { username: "test_borrower", password: "borrower1234" };
const CALIPER = "เวอร์เนียคาลิปเปอร์ดิจิทัล";
const JUMPER_WIRES = "สายจัมเปอร์ชุดใหญ่";

let pickupDate: string;
let maxBorrowDays: number;
function e2eRequestDate(): string {
  return pickupDate;
}

function e2eReturnDate(daysFromPickup: number): string {
  return toLocalDayKey(
    addDays(localTimeToUtc(pickupDate, "00:00"), daysFromPickup),
  );
}

async function signInAsBorrower(page: Page) {
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(BORROWER.username);
  await page.locator("#loc-pass").fill(BORROWER.password);
  const login = mutationResponse(page, "auth.login");
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  const body: unknown = await (await login).json();
  const envelope = (Array.isArray(body) ? body[0] : body) as {
    result?: { data?: unknown };
  };
  return loginOutput.parse(envelope.result?.data).user;
}

async function addSeedT0Items(page: Page) {
  await page.goto("/catalog");
  await expect(
    page.getByRole("heading", { name: "Equipment catalog" }),
  ).toBeVisible();

  for (const itemName of [CALIPER, JUMPER_WIRES]) {
    const row = page.getByRole("row").filter({ hasText: itemName });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Add" }).click();
  }

  await page.getByRole("button", { name: "2 selected", exact: true }).click();
  await expect(page).toHaveURL("/request");
}

async function chooseRequestWindow(page: Page, returnDaysFromPickup = 1) {
  await page.getByLabel("Pickup date", { exact: true }).fill(e2eRequestDate());
  await page
    .getByLabel("Return date", { exact: true })
    .fill(e2eReturnDate(returnDaysFromPickup));
  await page.getByRole("button", { name: "13:00" }).first().click();
}

function mutationResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname
      .split("/trpc/")[1]
      ?.split(",");
    return (
      procedures?.includes(procedure) === true &&
      response.request().method() === "POST"
    );
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
    pickupDate = toLocalDayKey(addDays(new Date(), 31));
    const user = await signInAsBorrower(page);
    maxBorrowDays = user.maxBorrowDays;
  });

  test("6.1: adds two items and opens one combined request draft", async ({
    page,
  }) => {
    await addSeedT0Items(page);

    const draftRows = page.getByRole("row");
    await expect(draftRows.filter({ hasText: CALIPER })).toBeVisible();
    await expect(draftRows.filter({ hasText: JUMPER_WIRES })).toBeVisible();
    await chooseRequestWindow(page);
    await expect(
      page.getByRole("button", { name: "Submit request" }),
    ).toBeEnabled();
  });

  test("6.2: requires a valid pickup/return period within the allowed range", async ({
    page,
  }) => {
    await addSeedT0Items(page);

    const submit = page.getByRole("button", { name: "Submit request" });
    // Choose a future pickup explicitly: today's default time may have passed.
    await chooseRequestWindow(page);
    await expect(submit).toBeEnabled();

    await page
      .getByLabel("Pickup date", { exact: true })
      .fill(e2eRequestDate());
    await page
      .getByLabel("Return date", { exact: true })
      .fill(e2eReturnDate(maxBorrowDays));
    await page.getByRole("button", { name: "13:00" }).first().click();
    await expect(submit).toBeDisabled();

    // The inclusive span comes from the authenticated borrower's real limits.
    await page
      .getByLabel("Return date", { exact: true })
      .fill(e2eReturnDate(maxBorrowDays - 1));
    await expect(submit).toBeEnabled();
  });

  test("6.11: submits the request through loan.create and shows both requested items", async ({
    page,
  }) => {
    await addSeedT0Items(page);

    await chooseRequestWindow(page);

    const create = mutationResponse(page, "loan.create");
    await page.getByRole("button", { name: "Submit request" }).click();

    const createResponse = await create;
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const body: unknown = await createResponse.json();
    const envelope = (Array.isArray(body) ? body[0] : body) as {
      result?: { data?: unknown };
    };
    const result = createRequestOutput.parse(envelope.result?.data);
    expect(result.created).toHaveLength(2);
    expect(result.rejected).toEqual([]);
    await expect(page).toHaveURL("/my/loans");
    await expect(
      page.getByRole("heading", { name: CALIPER, exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: JUMPER_WIRES, exact: true }).first(),
    ).toBeVisible();

    await cancelLatestRequest(page, CALIPER);
    await cancelLatestRequest(page, JUMPER_WIRES);
  });
});
