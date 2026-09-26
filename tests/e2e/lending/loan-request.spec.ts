import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/api-contracts";

const BORROWER = { username: "test_borrower", password: "borrower1234" };
const CALIPER = "เวอร์เนียคาลิปเปอร์ดิจิทัล";
const JUMPER_WIRES = "สายจัมเปอร์ชุดใหญ่";

/** Mirrors REQUEST_TIMES in request-draft.store.ts. */
const PICKUP_TIME_SLOTS = ["08:00", "13:00", "16:00"];

/** Today's date and current time-of-day in Asia/Bangkok, regardless of the
 * host machine's own timezone. */
function bangkokParts(date = new Date()): { day: string; hm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}

/**
 * Today in Asia/Bangkok, or N calendar days after it.
 *
 * `Date#toISOString` reports UTC, which lands on the wrong calendar day
 * whenever it is past midnight but before 07:00 in Bangkok. Anchoring the
 * arithmetic at UTC noon on Bangkok's own y/m/d keeps it correct no matter
 * what timezone the test runner itself is in.
 */
function bangkokDay(offsetDays = 0): string {
  const [y, m, d] = bangkokParts().day.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return anchor.toISOString().slice(0, 10);
}

/**
 * T0 stock is walk-in only (FR-RSV-03: not reservable ahead), so pickup has
 * to be today at a preset time that has not passed yet - picking a fixed
 * slot like "13:00" would fail the "must be in the future" check once the
 * suite runs past it. Tests that need one skip once none is left.
 */
function nextPickupTime(): string {
  const { hm } = bangkokParts();
  return PICKUP_TIME_SLOTS.find((slot) => slot > hm) ?? PICKUP_TIME_SLOTS[PICKUP_TIME_SLOTS.length - 1];
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
  // The request page's chunk loads in behind the navigation, and the
  // catalog's own period filter (also labelled "Pickup date/time", as a
  // combobox rather than a plain input) can still be on screen for a moment
  // after the URL changes. Wait for this page's own heading before touching
  // any field, or a getByLabel("Pickup date") call can resolve to the wrong
  // page's control.
  await expect(page.getByRole("heading", { name: "New borrow request" })).toBeVisible();
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

    // Selected items now list as rows in one table rather than separate
    // cards, but the point of this test - both items land on one shared
    // draft - still holds.
    await expect(page.getByRole("cell", { name: CALIPER, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: JUMPER_WIRES, exact: true })).toBeVisible();
  });

  test("6.2: requires a valid pickup/return period within the allowed range", async ({ page }) => {
    // Same-day pickup only (FR-RSV-03), and after the last slot none is left.
    expect(bangkokParts().hm < PICKUP_TIME_SLOTS.at(-1)!, "Use the isolated runner's business clock").toBe(true);
    await addSeedT0Items(page);
    await page.getByRole("button", { name: nextPickupTime() }).first().click();

    const submit = page.getByRole("button", { name: "Submit request" });
    // Return tomorrow: the same-day default stops being valid late in the day,
    // once the next pickup slot is the last one.
    await page.getByLabel("Return date").fill(bangkokDay(1));
    await expect(submit).toBeEnabled();

    // Pickup + 13 days is a 14-day loan inclusive of both ends, exactly the
    // D0 credit band's cap.
    await page.getByLabel("Return date").fill(bangkokDay(13));
    await expect(submit).toBeEnabled();

    // Pickup + 14 days is a 15-day loan, one more than the D0 allowance.
    await page.getByLabel("Return date").fill(bangkokDay(14));
    await expect(submit).toBeDisabled();
  });

  test("6.11: submits the request through loan.create and shows both requested items", async ({ page }) => {
    // Same-day pickup only (FR-RSV-03), and after the last slot none is left.
    expect(bangkokParts().hm < PICKUP_TIME_SLOTS.at(-1)!, "Use the isolated runner's business clock").toBe(true);
    await addSeedT0Items(page);

    // T0 stock is walk-in only (FR-RSV-03), so pickup must be today. Returning
    // the next day means the pickup/return times never have to straddle the
    // same day's preset slots.
    await page.getByLabel("Pickup date").fill(bangkokDay(0));
    await page.getByRole("button", { name: nextPickupTime() }).first().click();
    await page.getByLabel("Return date").fill(bangkokDay(1));

    const create = mutationResponse(page, "loan.create");
    await page.getByRole("button", { name: "Submit request" }).click();

    expect((await create).ok()).toBeTruthy();
    await expect(page).toHaveURL("/my/loans");
    // Same code-split timing as the catalog -> request hop: the URL changes
    // before the my-loans chunk has mounted, and the old (now-cleared)
    // request page briefly still renders. Wait for this page's own heading.
    await expect(page.getByRole("heading", { name: "My requests" })).toBeVisible();
    await expect(page.getByRole("heading", { name: CALIPER, exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: JUMPER_WIRES, exact: true }).first()).toBeVisible();

    await cancelLatestRequest(page, CALIPER);
    await cancelLatestRequest(page, JUMPER_WIRES);
  });
});
