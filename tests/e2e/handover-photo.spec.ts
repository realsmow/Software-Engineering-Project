import { expect, test, type Page, type Locator } from "@playwright/test";

const BORROWER = { username: "test_borrower", password: "borrower1234" };
const STAFF = { username: "test_staff", password: "staff1234" };

/** Mirrors REQUEST_TIMES in request-draft.store.ts. */
const PICKUP_TIME_SLOTS = ["08:00", "13:00", "16:00"];

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

function bangkokDay(offsetDays = 0): string {
  const [y, m, d] = bangkokParts().day.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return anchor.toISOString().slice(0, 10);
}

/** A same-day pickup slot that has not passed yet. */
function nextPickupTime(): string {
  const { hm } = bangkokParts();
  return PICKUP_TIME_SLOTS.find((slot) => slot > hm) ?? PICKUP_TIME_SLOTS[PICKUP_TIME_SLOTS.length - 1];
}

async function signIn(
  page: Page,
  credentials: { username: string; password: string },
  landing: RegExp,
) {
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(credentials.username);
  await page.locator("#loc-pass").fill(credentials.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(landing, { timeout: 10_000 });
}

function mutationResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname.split("/trpc/")[1]?.split(",");
    return procedures?.includes(procedure) === true && response.request().method() === "POST";
  });
}

/**
 * Every dialog on the inventory page renders a bare `<label>` beside its
 * control rather than an associated `htmlFor`/`id` pair (confirmed by
 * inspecting the rendered DOM), so fields are found structurally: the control
 * is the label's next sibling in the same `Field` wrapper.
 */
function field(scope: Locator, label: string): Locator {
  return scope.locator("label", { hasText: label }).locator("xpath=following-sibling::*[1]");
}

/** A minimal but valid 1x1 JPEG, small enough to stay well under the 5 MB cap. */
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

function jpegFile(name: string) {
  return { name, mimeType: "image/jpeg", buffer: Buffer.from(TINY_JPEG_BASE64, "base64") };
}

/**
 * Creates a brand-new T1 equipment type with one unit and opens it up to
 * borrowers, so the request in this test never contends with whatever the
 * shared catalogue's real stock is doing.
 *
 * This test originally borrowed an existing seeded T1 item, but a Reservation
 * is never un-approved once made (backend/src/common/booking/booking-window.ts
 * clashingWindowFilter matches on ApproveStatus, not on whether the loan
 * finished) - so a same-day pickup permanently claims that resource's rest of
 * the day, and re-running the suite (or another agent's run, or a prior manual
 * probe against this same dev database) starves the shared T1 stock within a
 * few runs. A unit created fresh for this run, and never reused, sidesteps
 * that entirely.
 */
async function seedFreshT1Unit(page: Page): Promise<string> {
  const typeName = `E2E Handover ${Date.now()}`;

  await page.goto("/staff/inventory");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.getByRole("button", { name: "New equipment type" }).click();
  const typeDialog = page.getByRole("dialog");
  await field(typeDialog, "Name").fill(typeName);
  await typeDialog.getByRole("button", { name: "Create", exact: true }).click();
  await typeDialog.getByRole("heading", { name: "Equipment type created" }).waitFor();
  await typeDialog.getByRole("button", { name: "Add units now" }).click();

  const unitDialog = page.getByRole("dialog");
  await unitDialog.getByRole("combobox").first().click();
  await page.getByRole("option").first().click();
  await unitDialog.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /^T1/ }).click();
  await unitDialog.getByRole("button", { name: "Register" }).click();
  await expect(unitDialog).toBeHidden();

  // Open it up to students in every department this staff account can grant,
  // since which department the seeded borrower belongs to is not this test's
  // business to assume.
  await page.goto("/staff/permissions");
  await page.getByRole("combobox", { name: "Equipment type or room" }).selectOption({ label: typeName });
  const groupSelect = page.getByRole("combobox", { name: "Group / department" });
  const groupOptions = await groupSelect.locator("option:not([value=''])").allInnerTexts();
  for (const groupLabel of groupOptions) {
    await groupSelect.selectOption({ label: groupLabel });
    await page.getByRole("combobox", { name: "Role" }).selectOption({ label: "Student" });
    await page.getByRole("button", { name: "Add rule", exact: true }).click();
  }
  const save = mutationResponse(page, "item.setEligibility");
  await page.getByRole("button", { name: "Save eligibility", exact: true }).click();
  expect((await save).ok()).toBeTruthy();

  return typeName;
}

test.describe("Module 5/6 handover photo gate", () => {
  test("staff cannot hand over a T1 loan until a handover photo is attached", async ({ page }) => {
    // This is a full walk of the loan lifecycle (seed -> request -> prepare ->
    // handover -> return -> inspect) across three roles, well past the
    // project default of 30s per test.
    test.setTimeout(90_000);

    await signIn(page, STAFF, /\/staff$/);
    const itemName = await seedFreshT1Unit(page);

    // ── Borrower submits a same-day T1 request ─────────────────────────────
    await signIn(page, BORROWER, /\/$/);
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Equipment catalog" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Search by name, code or brand" }).fill(itemName);

    const catalogRow = page.getByRole("row").filter({ hasText: itemName });
    await expect(catalogRow).toBeVisible();
    await catalogRow.getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: "1 selected", exact: true }).click();

    await expect(page).toHaveURL("/request");
    await expect(page.getByRole("heading", { name: "New borrow request" })).toBeVisible();

    const pickup = nextPickupTime();
    await page.getByLabel("Pickup date").fill(bangkokDay(0));
    await page
      .getByRole("group", { name: "Equipment pickup time" })
      .getByRole("button", { name: pickup })
      .click();
    await page.getByLabel("Return date").fill(bangkokDay(1));

    const create = mutationResponse(page, "loan.create");
    await page.getByRole("button", { name: "Submit request" }).click();
    expect((await create).ok()).toBeTruthy();
    await expect(page).toHaveURL("/my/loans");

    // ── Staff prepares the request ──────────────────────────────────────
    await signIn(page, STAFF, /\/staff$/);
    await expect(page.getByRole("heading", { name: "Work queue" })).toBeVisible();

    const search = page.locator('input[type="search"]');
    await search.fill(itemName);

    const prepareRow = page.getByRole("row").filter({ hasText: itemName }).first();
    await expect(prepareRow).toBeVisible();
    const prepare = mutationResponse(page, "loan.allocate");
    await prepareRow.getByRole("button", { name: "Prepare", exact: true }).click();
    expect((await prepare).ok()).toBeTruthy();

    // ── Switch to "To hand over" and confirm the button is gated on a photo ─
    // The bucket switch is the count tile itself (its own `Segmented` control
    // is dead: `DataTable` only renders `headerActions` when a `title` is
    // also passed, and this table has none - see
    // frontend/src/components/ui/data-table.tsx:88-91 vs staff-queue-page.tsx).
    await page.getByRole("button", { name: /^To hand over/ }).click();
    await search.fill(itemName);
    const handoverRow = page.getByRole("row").filter({ hasText: itemName }).first();
    await expect(handoverRow).toBeVisible();

    // The chosen pickup slot may still be ahead of "now" - the row then reads
    // "Hand over early" rather than "Hand over".
    const handoverButton = handoverRow.getByRole("button", { name: /^Hand over/ });
    await expect(handoverButton).toBeDisabled();

    await handoverRow.locator('input[type="file"]').setInputFiles(jpegFile("handover.jpg"));
    await expect(handoverRow.getByText("Photo taken")).toBeVisible();
    await expect(handoverButton).toBeEnabled();

    // An early handover (the pickup slot has not arrived yet) asks for
    // confirmation first, since it also moves the return date earlier.
    page.once("dialog", (dialog) => void dialog.accept());
    const handover = mutationResponse(page, "loan.confirmPickup");
    await handoverButton.click();
    expect((await handover).ok()).toBeTruthy();
    await expect(page.getByText(/Handed over/)).toBeVisible();

    // ── Cleanup: return and grade the unit. The type/unit themselves are left
    // behind - once a unit has loan history the server refuses to delete it
    // (HAS_HISTORY, the same rule staff-equipment.spec.ts exercises), so a
    // completed loan is not something this suite can fully erase.
    await page.getByRole("button", { name: /^On loan/ }).click();
    await search.fill(itemName);
    const onLoanRow = page.getByRole("row").filter({ hasText: itemName }).first();
    await expect(onLoanRow).toBeVisible();
    await onLoanRow.locator('input[type="file"]').setInputFiles(jpegFile("return.jpg"));
    await expect(onLoanRow.getByText("Photo taken")).toBeVisible();
    const recordReturn = mutationResponse(page, "loan.recordReturn");
    await onLoanRow.getByRole("button", { name: "Record return", exact: true }).click();
    expect((await recordReturn).ok()).toBeTruthy();

    await page.goto("/staff/inspection");
    const inspectionRow = page.locator("section").filter({ hasText: itemName }).first();
    await expect(inspectionRow).toBeVisible();
    await inspectionRow.getByRole("button").first().click();
    await inspectionRow.getByRole("button", { name: /^B0/ }).click();
    const grade = mutationResponse(page, "inspection.create");
    await inspectionRow.getByRole("button", { name: "Record grade", exact: true }).click();
    expect((await grade).ok()).toBeTruthy();
  });
});
