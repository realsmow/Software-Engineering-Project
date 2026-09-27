import { expect, test } from "../fixtures/api-contracts";

/**
 * FR-AUTH-01: Google sign-in ships switched off until GOOGLE_* is configured.
 * Off must mean off everywhere: no button, and no route that starts the flow.
 */
test.describe("Google sign-in while not configured", () => {
  test("shows no Google button on the login page", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
    await page.goto("/login");
    await expect(page.locator("#m-local .login-method-header")).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toHaveCount(0);
  });

  test("refuses to start the OAuth flow", async ({ request }) => {
    const res = await request.get("http://localhost:3000/auth/google", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });
});
