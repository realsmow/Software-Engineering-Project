import { expect, test, type Page } from "@playwright/test";

const ADMIN = { username: "test_admin", password: "admin1234" };

async function signInAsAdmin(page: Page) {
  await page.addInitScript(() => localStorage.setItem("ulms-locale", "en"));
  await page.goto("/login");
  await page.locator("#m-local .login-method-header").click();
  await page.locator("#loc-user").fill(ADMIN.username);
  await page.locator("#loc-pass").fill(ADMIN.password);
  await page.locator('#m-local button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });
}

function trpcResponse(page: Page, procedure: string) {
  return page.waitForResponse((response) => {
    const procedures = new URL(response.url()).pathname
      .split("/trpc/")[1]
      ?.split(",");

    return (
      procedures?.includes(procedure) === true &&
      response.request().method() === "GET"
    );
  });
}

const ROOM_FIXTURE = {
  id: 999_999,
  name: "E2E Engineering Lab",
  description: "Room fixture for the same-day booking screen.",
  location: "Engineering Building",
  imageUrl: null,
  capacity: 24,
  tier: "T3",
  creditWeight: 1,
  status: "InStorage",
  allowBorrow: true,
  bookable: true,
  owner: null,
};

type TrpcResult = {
  result?: { data?: unknown };
  [key: string]: unknown;
};

function roomAvailability(date: string) {
  const starts = [
    ...Array.from({ length: 10 }, (_, index) => 420 + index * 30),
    ...Array.from({ length: 10 }, (_, index) => 780 + index * 30),
  ];

  return {
    roomKey: ROOM_FIXTURE.id,
    date,
    slots: starts.map((minutes, index) => {
      const start = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const endMinutes = minutes + 30;
      const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

      return {
        index,
        start,
        end,
        startTime: new Date(`${date}T${start}:00+07:00`).toISOString(),
        endTime: new Date(`${date}T${end}:00+07:00`).toISOString(),
        available: true,
      };
    }),
    maxSlotsPerBooking: 6,
    slotMinutes: 30,
  };
}

async function installRoomFixtures(page: Page) {
  await page.route("**/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.split("/trpc/")[1]?.split(",") ?? [];
    if (!procedures.some((procedure) => ["item.listRooms", "item.getRoomById", "item.roomAvailability"].includes(procedure))) {
      await route.continue();
      return;
    }

    // Keep unrelated procedures in the same tRPC batch connected to the real
    // backend; replace only the room responses that need deterministic data.
    const upstream = await route.fetch();
    const encodedInput = url.searchParams.get("input");
    const inputs = encodedInput
      ? (JSON.parse(encodedInput) as Record<string, { date?: string }>)
      : {};
    const rawResults: unknown = await upstream.json();
    const results: TrpcResult[] = Array.isArray(rawResults)
      ? (rawResults as TrpcResult[])
      : [rawResults as TrpcResult];
    procedures.forEach((procedure, index) => {
      if (procedure === "item.listRooms") {
        results[index] = {
          result: { data: {
            items: [ROOM_FIXTURE],
            total: 1,
            page: 1,
            pageSize: 100,
          } },
        };
      } else if (procedure === "item.getRoomById") {
        results[index] = { result: { data: ROOM_FIXTURE } };
      } else if (procedure === "item.roomAvailability") {
        const date = inputs[String(index)]?.date ?? new Date().toISOString().slice(0, 10);
        results[index] = { result: { data: roomAvailability(date) } };
      }
    });

    await route.fulfill({
      response: upstream,
      body: JSON.stringify(url.searchParams.has("batch") ? results : results[0]),
    });
  });
}

test.describe("Module 5 equipment browser flows", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  test("loads the borrower catalogue through item.list and exposes search/filter controls", async ({
    page,
  }) => {
    const response = trpcResponse(page, "item.list");
    await page.goto("/catalog");

    expect((await response).ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Equipment catalog" }),
    ).toBeVisible();
    await expect(page.getByRole("searchbox").first()).toBeVisible();
    await expect(page.getByText("Tier", { exact: true }).first()).toBeVisible();
  });

  test("loads staff inventory through item.listManaged and supports expanding a type", async ({
    page,
  }) => {
    const response = trpcResponse(page, "item.listManaged");
    await page.goto("/staff/inventory");

    expect((await response).ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: "Inventory" }),
    ).toBeVisible();
    await expect(page.getByText("Item types")).toBeVisible();

    const viewUnits = page.getByRole("button", { name: /View units/i }).first();
    if (await viewUnits.count()) {
      const detail = trpcResponse(page, "item.getManagedById");
      await viewUnits.click();
      expect((await detail).ok()).toBeTruthy();
    }
  });

  test("opens equipment detail and shows live unit availability", async ({
    page,
  }) => {
    const list = trpcResponse(page, "item.list");
    await page.goto("/catalog");
    expect((await list).ok()).toBeTruthy();

    const detailsBtn = page.getByRole("button", { name: "Details" }).first();
    const row = page.locator("tbody tr").first();
    const opener = (await detailsBtn.count()) ? detailsBtn : row;
    test.skip(
      !(await opener.count()),
      "Seed database has no equipment type to open.",
    );

    const detail = trpcResponse(page, "item.getById");
    await opener.click();
    expect((await detail).ok()).toBeTruthy();
    await expect(page.getByRole("columnheader", { name: "Unit serial" })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText("Free for your dates").first()).toBeVisible();
  });

  test("opens a T3 facility and shows its capacity and same-day slot calendar", async ({
    page,
  }) => {
    await installRoomFixtures(page);
    await page.goto("/rooms");

    await expect(page.getByRole("heading", { name: "Room list" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Book this room" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Book this room" }).first().click();

    await expect(
      page.getByRole("heading", { name: "New room booking" }),
    ).toBeVisible();
    await expect(page.getByText(/Fixed facilities \(T3\) are booked same-day only/)).toBeVisible();
    await expect(page.getByText(/\d+\s*seats/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "07:00" })).toBeVisible();
    await expect(page.getByRole("button", { name: "17:30" })).toBeVisible();
    await expect(page.getByText(/lunch break - not bookable/)).toBeVisible();
  });
});
