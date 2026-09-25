import { expect, test, type Page, type Locator } from "@playwright/test";

const STAFF = { username: "test_staff", password: "staff1234" };
const SUPERVISOR = { username: "test_supervisor", password: "supervisor1234" };

/** A per-run suffix so repeated runs never collide on a unique name. */
function uniqueName(label: string): string {
  return `E2E ${label} ${Date.now()}`;
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

/**
 * Every dialog on this page renders a bare `<label>` beside its control
 * rather than an associated `htmlFor`/`id` pair (confirmed by inspecting the
 * rendered DOM - `getByLabel` does not resolve any field here), so fields are
 * found structurally: the control is the label's next sibling in the same
 * `Field` wrapper.
 */
function field(scope: Locator, label: string): Locator {
  return scope.locator("label", { hasText: label }).locator("xpath=following-sibling::*[1]");
}

/** Accept the next native `window.confirm`, e.g. a delete confirmation. */
function acceptNextConfirm(page: Page) {
  page.once("dialog", (dialog) => void dialog.accept());
}

test.describe("Module 5 staff equipment management", () => {
  test("creates a type with units and a room, deletes a unit and room, and gets a retirement approved", async ({
    page,
  }) => {
    await signIn(page, STAFF, /\/staff$/);
    await page.goto("/staff/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();

    // ── 1. New equipment type with a price, suggested tier shown ──────────
    const typeName = uniqueName("Type");
    await page.getByRole("button", { name: "New equipment type" }).click();
    const newTypeDialog = page.getByRole("dialog");
    await expect(newTypeDialog.getByRole("heading", { name: "New equipment type" })).toBeVisible();
    await field(newTypeDialog, "Name").fill(typeName);
    // 500 baht lands in the T1 band (suggestTierFromPrice: 100-1000 -> T1).
    await field(newTypeDialog, "Price (baht)").fill("500");
    await expect(newTypeDialog.getByText("Suggested tier from this price: T1")).toBeVisible();
    await newTypeDialog.getByRole("button", { name: "Create", exact: true }).click();

    // A fresh type has no units, so the dialog offers to add them right away -
    // otherwise it would never show up in the list below (item.management
    // only lists types that already own at least one unit).
    await expect(newTypeDialog.getByRole("heading", { name: "Equipment type created" })).toBeVisible();
    await newTypeDialog.getByRole("button", { name: "Add units now" }).click();

    // ── 2. Two T1 units, no serial required ────────────────────────────────
    const addUnitsDialog = page.getByRole("dialog");
    await expect(addUnitsDialog.getByRole("heading", { name: `Add units to ${typeName}` })).toBeVisible();
    await addUnitsDialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await addUnitsDialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: /^T1/ }).click();
    await field(addUnitsDialog, "Quantity").fill("2");
    const registerButton = addUnitsDialog.getByRole("button", { name: "Register" });
    await expect(registerButton).toBeEnabled();
    await registerButton.click();
    await expect(addUnitsDialog).toBeHidden();

    // Open the type's row to reach its units table.
    const typeRow = page.getByRole("button", { name: new RegExp(typeName) });
    await expect(typeRow).toBeVisible();
    await typeRow.click();
    await expect(page.getByText("2 / 2")).toBeVisible();

    // ── 3. One T2 unit: serial is mandatory, submit is refused without it ──
    await page.getByRole("button", { name: "Add units", exact: true }).click();
    const addT2Dialog = page.getByRole("dialog");
    await addT2Dialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await addT2Dialog.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: /^T2/ }).click();

    const t2Serial = `E2E-${Date.now()}`;
    const t2Register = addT2Dialog.getByRole("button", { name: "Register" });
    await expect(t2Register).toBeDisabled();
    await field(addT2Dialog, "Serial number").fill(t2Serial);
    await expect(t2Register).toBeEnabled();
    await t2Register.click();
    await expect(addT2Dialog).toBeHidden();

    // The count shows in the tile and the type card; any one is enough.
    await expect(page.getByText("3 / 3").first()).toBeVisible();
    const unitsTable = page.locator("table").filter({ has: page.getByRole("columnheader", { name: "Serial" }) });
    const t2Row = unitsTable.locator("tbody tr").filter({ hasText: t2Serial });
    await expect(t2Row).toBeVisible();

    // ── 4. Delete one of the two fresh T1 units ────────────────────────────
    // Both T1 units are brand new with no loan history, so either row's
    // Delete succeeds; take the table's first row (the T2 row sorts after it).
    const firstUnitRow = unitsTable.locator("tbody tr").first();
    await expect(firstUnitRow).toBeVisible();
    acceptNextConfirm(page);
    await firstUnitRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();

    // ── 5. Room with custom opening hours, then delete it ──────────────────
    const roomName = uniqueName("Room");
    await page.getByRole("button", { name: "New room" }).click();
    const roomDialog = page.getByRole("dialog");
    await expect(roomDialog.getByRole("heading", { name: "New room" })).toBeVisible();
    await roomDialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await field(roomDialog, "Room name").fill(roomName);
    // Custom hours: 09:00-18:00 instead of the 07:00-18:00 default.
    await field(roomDialog, "Opens").selectOption("540");
    await field(roomDialog, "Closes").selectOption("1080");
    await roomDialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(roomDialog).toBeHidden();

    const roomRow = page.getByRole("row").filter({ hasText: roomName });
    await expect(roomRow).toBeVisible();
    await expect(roomRow).toContainText("09:00-18:00");
    acceptNextConfirm(page);
    await roomRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: roomName })).toBeHidden();

    // ── 6. Request retirement of a fresh unit, approve it as supervisor ────
    const retirementReason = `E2E retirement ${Date.now()}`;
    await t2Row.getByRole("button", { name: "Request retirement" }).click();
    await t2Row.getByPlaceholder("Reason for retirement").fill(retirementReason);
    await t2Row.getByRole("button", { name: "Send request" }).click();
    await expect(t2Row.getByText("Retirement request sent")).toBeVisible();

    await signIn(page, SUPERVISOR, /\/supervisor\/approvals$/);
    await page.getByRole("tab", { name: "Retirements", exact: true }).click();
    const retirementRow = page.getByRole("row").filter({ hasText: retirementReason });
    await expect(retirementRow).toBeVisible();
    await retirementRow.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: retirementReason })).toBeHidden();
  });
});
