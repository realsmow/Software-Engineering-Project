import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { errors, type Page } from "@playwright/test";
import type { Client as PostgresClient } from "../../../backend/node_modules/@types/pg";
import { userOutput } from "../../../backend/src/common/schemas/user.schema";
import { liveCall, login, mutationData, mutationResponse } from "../fixtures/live-workflow";
import { expect, test } from "../fixtures/api-contracts";
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

const backendRequire = createRequire(
  resolve(__dirname, "../../../backend/package.json"),
);

const { Client } = backendRequire("pg") as { Client: typeof PostgresClient };

test("FR-AUTH-06: redirects an expired session to login on menu navigation without reloading", async ({
  page,
}) => {
  // This test expires a real database row. Refuse the development database
  // even when ordinary Playwright is pointed at a running local application.
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
    !/^\/ulms_test_\d+_\d+$/.test(databaseUrl.pathname)
  ) {
    throw new Error(
      "Session expiry requires the isolated E2E runner and its disposable database",
    );
  }

  const database = new Client({ connectionString: databaseUrl.toString() });
  let tokenHash: string | undefined;
  let accountKey: number | undefined;
  let redirectedWithoutReload = false;
  await database.connect();
  try {
    await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
    const user = await login(page.request, "borrower");
    accountKey = user.id;
    expect(await liveCall(page.request, "auth.me", userOutput)).toMatchObject({
      id: accountKey,
    });
    await page.goto("/");
    const catalogMenu = page.getByRole("button", {
      name: "Equipment catalog",
      exact: true,
    });
    await expect(catalogMenu).toBeVisible();

    const cookie = (await page.context().cookies("http://localhost:3000")).find(
      (row) => row.name === "ulms_session",
    );
    expect(cookie, "Login must issue a real session cookie").toBeDefined();
    const separator = cookie!.value.lastIndexOf(".");
    expect(separator).toBeGreaterThan(0);
    const sessionId = Buffer.from(
      cookie!.value.slice(0, separator),
      "base64url",
    ).toString("utf8");
    tokenHash = createHash("sha256").update(sessionId).digest("hex");
    const now = new Date();
    const expiredAt = new Date(now.getTime() - 1_000);
    const expired = await database.query(
      `UPDATE "SessionInfo" SET "ExpiresAt" = $1
       WHERE "TokenHash" = $2 AND "AccountKey" = $3
         AND "RevokedAt" IS NULL AND "ExpiresAt" > $4
       RETURNING "SessionKey"`,
      [expiredAt, tokenHash, accountKey, now],
    );
    expect(
      expired.rowCount,
      "Expire only the session issued for this browser",
    ).toBe(1);
    const stored = await database.query<{
      ExpiresAt: Date;
      RevokedAt: Date | null;
    }>(
      `SELECT "ExpiresAt", "RevokedAt" FROM "SessionInfo" WHERE "TokenHash" = $1`,
      [tokenHash],
    );
    expect(stored.rows[0].ExpiresAt.getTime()).toBe(expiredAt.getTime());
    expect(stored.rows[0].RevokedAt).toBeNull();

    // APIRequestContext shares the cookie but does not notify the frontend.
    // Prove expiry is real before testing the SPA's response to its own 401.
    // auth.me answers null once the session is gone (#184).
    const me = await page.request.get("http://localhost:3000/trpc/auth.me");
    expect(me.status()).toBe(200);
    expect((await me.json()).result.data).toBeNull();
    // Any API call can be the first to meet the expired session: a background
    // poll often wins and redirects on its own (#138). Otherwise the menu
    // click triggers it. Either way the redirect must come without a reload.
    const denied = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.includes("/trpc/") &&
        response.status() === 401,
    );
    await catalogMenu.click({ timeout: 2_000 }).catch(() => undefined);
    const response = await denied;
    await test.info().attach("expired-session-api-refusal", {
      body: JSON.stringify(
        { status: response.status(), body: await response.json() },
        null,
        2,
      ),
      contentType: "application/json",
    });

    // Observe the desired redirect without recording an assertion failure yet.
    // Bootstrap and cleanup must succeed before the expected-defect marker.
    try {
      await page.waitForURL(/\/login(?:\?.*)?$/, { timeout: 10_000 });
      redirectedWithoutReload = true;
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
    }
    if (!redirectedWithoutReload) {
      await test.info().attach("expired-session-before-reload", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      await page.reload();
      await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    }
    await expect(page.locator("#m-local .login-method-header")).toBeVisible();
    await expect(catalogMenu).toHaveCount(0);
  } finally {
    try {
      if (tokenHash && accountKey !== undefined) {
        await database.query(
          `DELETE FROM "SessionInfo" WHERE "TokenHash" = $1 AND "AccountKey" = $2`,
          [tokenHash, accountKey],
        );
      }
    } finally {
      await database.end();
    }
  }

  expect(
    redirectedWithoutReload,
    "a browser API 401 must end the authenticated UI without reload",
  ).toBe(true);
});
