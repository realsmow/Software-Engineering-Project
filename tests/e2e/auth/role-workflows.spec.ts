import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/api-contracts";
import { mutationData, mutationResponse } from "../fixtures/live-workflow";
import { loginOutput } from "../../../backend/src/auth/auth.schema";

const USERS = {
  staff: { username: "test_staff", password: "staff1234", landing: "/staff" },
  supervisor: {
    username: "test_supervisor",
    password: "supervisor1234",
    landing: "/supervisor/approvals",
  },
  borrower: {
    username: "test_borrower",
    password: "borrower1234",
    landing: "/",
  },
} as const;

async function signIn(page: Page, role: keyof typeof USERS) {
  const user = USERS[role];
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(user.username);
  await page.locator("#loc-pass").fill(user.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(user.landing, {
    timeout: 10_000,
  });
}

function queryResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname.split("/trpc/")[1]?.split(",");
    return (
      procedures?.includes(procedure) === true && response.request().method() === "GET"
    );
  });
}

test.describe("Staff and supervisor workspaces", () => {
  test("NFR usability: signs in with keyboard navigation and submits the real local-login form", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
    await page.goto("/login");
    const method = page.locator("#m-local .login-method-header");
    await method.focus();
    await page.keyboard.press("Enter");
    await expect(method).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(page.locator("#loc-user")).toBeFocused();
    await page.keyboard.insertText(USERS.borrower.username);
    await page.keyboard.press("Tab");
    await expect(page.locator("#loc-pass")).toBeFocused();
    await page.keyboard.insertText(USERS.borrower.password);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Show", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(page.locator("#loc-pass")).toHaveAttribute("type", "text");
    await page.keyboard.press("Tab");
    await expect(page.locator('#m-local input[type="checkbox"]')).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator('#m-local button[type="submit"]')).toBeFocused();
    const response = mutationResponse(page, "auth.login");
    await page.keyboard.press("Enter");
    const result = await mutationData(await response, loginOutput);
    expect(result.user.role).toBe("borrower");
    await expect(page).toHaveURL("/");
  });

  test("staff loads the live preparation queue and inspection backlog", async ({
    page,
  }) => {
    await signIn(page, "staff");

    const queue = queryResponse(page, "loan.staffQueue");
    await page.reload();
    expect((await queue).ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();

    const inspections = queryResponse(page, "inspection.list");
    await page.goto("/staff/inspection");
    expect((await inspections).ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Inspection" })).toBeVisible();
  });

  test("supervisor loads their approval and extension queues from the backend", async ({
    page,
  }) => {
    await signIn(page, "supervisor");

    const approvals = queryResponse(page, "approval.queue");
    const extensions = queryResponse(page, "approval.extensionQueue");
    await page.reload();
    expect((await approvals).ok()).toBeTruthy();
    expect((await extensions).ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  });

  test("borrower opens notifications from the live notification endpoint", async ({
    page,
  }) => {
    await signIn(page, "borrower");

    const notifications = queryResponse(page, "notification.list");
    await page.locator('button[title="Notifications"]').click();
    expect((await notifications).ok()).toBeTruthy();
    await expect(page.getByText("Notifications", { exact: true }).last()).toBeVisible();
  });
});
