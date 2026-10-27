import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/api-contracts";

const ADMIN = { username: "test_admin", password: "admin1234" };
const BORROWER = { username: "test_borrower", password: "borrower1234" };
const API = "http://localhost:3000/trpc";

async function signIn(page: Page, credentials: { username: string; password: string }, landing: RegExp) {
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(credentials.username);
  await page.locator("#loc-pass").fill(credentials.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(landing, { timeout: 10_000 });
}

test("#224: the borrower is offered times from the admin's work hours", async ({ browser }) => {
  const admin = await browser.newPage();
  await signIn(admin, ADMIN, /\/admin$/);
  const setHours = (start: number, end: number) =>
    admin.request.post(`${API}/admin.updateWorkHours`, { data: { start, end } });

  expect((await setHours(9, 16)).ok()).toBe(true);
  try {
    const page = await browser.newPage();
    await signIn(page, BORROWER, /\/$/);
    await page.goto("/catalog");
    await page.getByRole("combobox", { name: "Return date and time" }).click();
    const options = await page.getByRole("option").allTextContents();
    expect(options).toEqual(["09:00", "13:00", "15:00", "16:00"]);
    // The saved 17:00 return moved to the new closing time.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox", { name: "Return date and time" })).toHaveText("16:00");
  } finally {
    expect((await setHours(8, 17)).ok()).toBe(true);
  }
});
