import type { Route } from "@playwright/test";
import { expect, test } from "../fixtures/api-contracts";
import {
  freshEquipment,
  liveCall,
  login,
  mutationData,
  mutationResponse,
  visitAs,
} from "../fixtures/live-workflow";
import {
  createRequestOutput,
  paginatedRequests,
  requestOutput,
} from "../../../backend/src/loan/loan.schema";
import {
  authorityRoleOptionOutput,
  eligibilityRule,
} from "../../../backend/src/item/item.schema";

test("FR-RSV-06: accepts the offered shorter period after a real booking race", async ({
  page,
  playwright,
}) => {
  const fixture = await freshEquipment(
    page.request,
    `G2 ${test.info().testId.slice(-8)}`
  );
  const roles = await liveCall(
    page.request,
    "item.listAuthorityRoles",
    authorityRoleOptionOutput.array()
  );
  const staffRole = roles.find((role) => role.name === "Lab staff");
  expect(staffRole, "The seeded staff authority must exist").toBeDefined();
  await liveCall(
    page.request,
    "item.setEligibility",
    eligibilityRule.array(),
    {
      itemKey: fixture.type.id,
      rules: [fixture.borrowerRole.authorityRoleKey, staffRole!.authorityRoleKey].map(
        (authorityRoleKey) => ({ groupKey: fixture.group.id, authorityRoleKey })
      ),
    },
    true
  );
  const blocker = await playwright.request.newContext();
  await login(blocker, "staff");
  const reservations: { key: number; owner: "borrower" | "staff" }[] = [];
  const maxEndTime = "2031-09-28T01:00:00.000Z"; // 08:00 Bangkok.
  let injected = false;
  let dialogMessage = "";
  page.on("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  const handler = async (route: Route) => {
    if (!injected && route.request().method() === "POST") {
      injected = true;
      const next = await liveCall(
        blocker,
        "loan.create",
        createRequestOutput,
        {
          startTime: maxEndTime,
          endTime: "2031-09-29T09:00:00.000Z",
          lines: [{ resourceKey: fixture.unit.resourceKey }],
        },
        true
      );
      expect(next.rejected).toEqual([]);
      expect(next.created).toHaveLength(1);
      reservations.push({ key: next.created[0].reservationKey, owner: "staff" });
    }
    // Both submissions reach the live backend; no success/error response is mocked.
    await route.fallback();
  };
  await page.route("**/trpc/loan.create*", handler);
  try {
    await visitAs(page, "borrower", "/catalog");
    const row = page.getByRole("row").filter({ hasText: fixture.type.name! });
    await row.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "1 selected", exact: true }).click();
    await expect(page.getByRole("heading", { name: "New borrow request" })).toBeVisible();
    await page.getByLabel("Pickup date").fill("2031-09-27");
    await page.getByRole("button", { name: "08:00", exact: true }).first().click();
    await page.getByLabel("Return date").fill("2031-09-29");
    await page.getByRole("button", { name: "16:00", exact: true }).last().click();
    await page.getByRole("checkbox", { name: new RegExp(fixture.unit.serialNo) }).check();
    const refusedResponse = mutationResponse(page, "loan.create");
    const retryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.includes("loan.create") &&
        response.request().postData()?.includes(maxEndTime) === true
    );
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    const refused = await mutationData(await refusedResponse, createRequestOutput);
    expect(refused.created).toEqual([]);
    expect(refused.rejected).toMatchObject([
      { code: "WINDOW_CROSSES_RESERVATION", detail: { maxEndTime } },
    ]);
    const retried = await mutationData(await retryResponse, createRequestOutput);
    expect(retried.rejected).toEqual([]);
    expect(retried.created).toHaveLength(1);
    reservations.push({ key: retried.created[0].reservationKey, owner: "borrower" });
    expect(retried.created[0]).toMatchObject({
      endTime: maxEndTime,
      resource: {
        resourceKey: fixture.unit.resourceKey,
        serialNo: fixture.unit.serialNo,
      },
    });
    expect(dialogMessage).toMatch(/shorten/i);
    await expect(page).toHaveURL("/my/loans");
    const persisted = await liveCall(page.request, "loan.list", paginatedRequests, {
      page: 1,
      pageSize: 100,
    });
    expect(
      persisted.items.find(
        (row) => row.reservationKey === retried.created[0].reservationKey
      )
    ).toMatchObject({ endTime: maxEndTime });
  } finally {
    await page.unroute("**/trpc/loan.create*", handler);
    for (const reservation of reservations)
      await liveCall(
        reservation.owner === "staff" ? blocker : page.request,
        "loan.cancel",
        requestOutput,
        { reservationKey: reservation.key },
        true
      );
    await blocker.dispose();
  }
});

test("NFR usability: completes a real equipment request from the mobile catalogue", async ({
  page,
}) => {
  const fixture = await freshEquipment(
    page.request,
    `Mobile ${test.info().testId.slice(-8)}`,
    "T1"
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await visitAs(page, "borrower", "/catalog");
  await page.locator('input[type="search"]:visible').fill(fixture.type.name!);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "1 selected", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New borrow request" })).toBeVisible();
  await page.getByLabel("Pickup date").fill("2031-09-27");
  await page.getByRole("button", { name: "08:00", exact: true }).first().click();
  await page.getByLabel("Return date").fill("2031-09-28");
  await page.getByRole("button", { name: "16:00", exact: true }).last().click();
  const response = mutationResponse(page, "loan.create");
  await page.getByRole("button", { name: "Submit request", exact: true }).click();
  const created = await mutationData(await response, createRequestOutput);
  expect(created.rejected).toEqual([]);
  expect(created.created).toHaveLength(1);
  try {
    expect(created.created[0]).toMatchObject({
      status: "approved",
      resource: { resourceKey: fixture.unit.resourceKey },
    });
    await expect(page).toHaveURL("/my/loans");
    await expect(
      page.getByRole("heading", { name: fixture.type.name!, exact: true })
    ).toBeVisible();
  } finally {
    await liveCall(
      page.request,
      "loan.cancel",
      requestOutput,
      { reservationKey: created.created[0].reservationKey },
      true
    );
  }
});
