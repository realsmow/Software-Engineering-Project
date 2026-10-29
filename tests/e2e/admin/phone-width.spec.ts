import { expect, test } from "../fixtures/api-contracts";
import { visitAs } from "../fixtures/live-workflow";

// #226 named the empty action column for screen readers with a visually hidden
// (absolutely positioned) label. Inside a table scroller that is not itself
// positioned, that label escaped the scroller and widened the whole page on a
// phone: at 375 px /staff/users measured 519 px and /admin/status 667 px.
for (const { role, path } of [
  { role: "staff", path: "/staff/users" },
  { role: "admin", path: "/admin/status" },
] as const) {
  test(`${path} fits a 375 px phone without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await visitAs(page, role, path);
    await expect(page.locator("table").first()).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}
