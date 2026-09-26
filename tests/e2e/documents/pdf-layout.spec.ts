import { expect, test } from "../fixtures/api-contracts";
import { userOutput } from "../../../backend/src/common/schemas/user.schema";
import {
  paginatedNotifications,
  unreadCountOutput,
} from "../../../backend/src/notification/notification.schema";
import { paginatedItems } from "../../../backend/src/item/item.schema";
import { paginatedRequests } from "../../../backend/src/loan/loan.schema";

// Browser geometry needs a real layout engine. These fixtures isolate the
// PDF's wrapping/scrolling regressions; they do not prove database behavior.
const longText = "ข้อความแจ้งเตือนและรายละเอียดอุปกรณ์ที่ยาวมาก".repeat(15);

test.describe("PDF text layout regressions", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
    await page.route("**/trpc/**", async (route) => {
      const url = new URL(route.request().url());
      const procedures = url.pathname.split("/trpc/")[1]?.split(",") ?? [];
      const results = procedures.map((procedure) => {
        let data: unknown;
        if (procedure === "auth.me") {
          data = userOutput.strict().parse({
            id: 1,
            studentId: "layout-test",
            firstName: longText,
            lastName: "Test",
            email: "layout@example.test",
            role: "borrower",
            facultyName: null,
            creditScore: 100,
            creditTier: "D0",
            maxBorrowDays: 14,
            maxExtendTimes: 2,
          });
        } else if (procedure === "notification.unreadCount") {
          data = unreadCountOutput.parse({ unread: 20 });
        } else if (procedure === "notification.list") {
          data = paginatedNotifications.parse({
            items: Array.from({ length: 20 }, (_, index) => ({
              id: String(index + 1),
              userId: "1",
              type: "request_approved",
              title: `${index}: ${longText}`,
              body: longText,
              createdAt: new Date().toISOString(),
              linkTo: "/my/loans",
            })),
            total: 20,
            page: 1,
            pageSize: 20,
          });
        } else if (procedure === "item.list") {
          data = paginatedItems.parse({
            items: [],
            nextCursor: null,
            total: 0,
            page: 1,
            pageSize: 100,
          });
        } else if (procedure === "loan.list") {
          data = paginatedRequests.parse({
            items: [],
            total: 0,
            page: 1,
            pageSize: 100,
          });
        } else {
          throw new Error(
            `Unhandled layout fixture API procedure: ${procedure}`,
          );
        }
        return { result: { data } };
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          url.searchParams.has("batch") ? results : results[0],
        ),
      });
    });
  });

  for (const width of [390, 1280]) {
    test(`keeps long borrower home text within the viewport at ${width}px (PDF p. 2)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page
          .getByRole("heading", {
            name: /Good|Overview|Welcome|Everything|due|loan|attention/i,
          })
          .first(),
      ).toBeVisible();
      await expect(
        page.getByText(`Hello ${longText} Test`, { exact: true }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`wraps long notification rows and scrolls the list at ${width}px (PDF p. 3)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/catalog");
      await page
        .getByRole("button", { name: "Notifications", exact: true })
        .click();
      const list = page.locator("div.max-h-96");
      await expect(list.getByRole("button")).toHaveCount(20);
      const dimensions = await list.evaluate((element) => ({
        width: element.clientWidth,
        contentWidth: element.scrollWidth,
        height: element.clientHeight,
        contentHeight: element.scrollHeight,
      }));
      expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.width + 1);
      expect(dimensions.contentHeight).toBeGreaterThan(dimensions.height);
      await list.getByRole("button").last().scrollIntoViewIfNeeded();
      await expect(list.getByRole("button").last()).toBeInViewport();
    });
  }
});
