import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/api-contracts";
import {
  advanceBusinessClock,
  freshEquipment,
  liveCall,
  login,
  mutationData,
  mutationResponse,
  visitAs,
} from "../fixtures/live-workflow";
import {
  itemUnit,
  itemUnitOutput,
  eligibilityRule,
} from "../../../backend/src/item/item.schema";
import {
  createRequestOutput,
  loanOutput,
  requestOutput,
} from "../../../backend/src/loan/loan.schema";
import { okOutput } from "../../../backend/src/common/schemas/ok.schema";

async function approvedRequest(page: Page, name: string, sibling = false) {
  const equipment = await freshEquipment(page.request, name, "T1");
  const alternatives = sibling
    ? await liveCall(
        page.request,
        "item.createUnit",
        itemUnitOutput.array(),
        {
          itemKey: equipment.type.id,
          manageGroupKey: equipment.group.id,
          tier: "T1",
          quantity: 1,
          prepDays: 0,
        },
        true
      )
    : [];
  if (sibling)
    await liveCall(
      page.request,
      "item.setEligibility",
      eligibilityRule.array(),
      {
        itemKey: equipment.type.id,
        rules: [
          {
            groupKey: equipment.group.id,
            authorityRoleKey: equipment.borrowerRole.authorityRoleKey,
          },
        ],
      },
      true
    );
  await login(page.request, "borrower");
  const input = {
    startTime: "2031-09-26T01:00:00.000Z",
    endTime: "2031-09-28T09:00:00.000Z",
    lines: [{ resourceKey: equipment.unit.resourceKey }],
  };
  const created = await liveCall(
    page.request,
    "loan.create",
    createRequestOutput,
    input,
    true
  );
  expect(created.rejected).toEqual([]);
  expect(created.created).toHaveLength(1);
  const reservation = created.created[0];
  expect(reservation.status).toBe("approved");
  expect(reservation.expiresAt).not.toBeNull();
  return { ...equipment, input, reservation, alternative: alternatives[0] };
}

async function prepareAtCounter(page: Page, name: string) {
  await visitAs(page, "staff", "/staff");
  await page.locator('input[type="search"]').fill(name);
  const row = page.getByRole("row").filter({ hasText: name }).first();
  const response = mutationResponse(page, "loan.allocate");
  await row.getByRole("button", { name: "Prepare", exact: true }).click();
  const loan = await mutationData(await response, loanOutput);
  expect(loan.status).toBe("Prepared");
  return loan;
}

async function expireRequest(page: Page, expiresAt: string) {
  await advanceBusinessClock(page, new Date(Date.parse(expiresAt) + 1).toISOString());
  await login(page.request, "admin");
  await liveCall(
    page.request,
    "admin.runCronJob",
    okOutput,
    { job: "expireStaleRequests" },
    true
  );
}

test("FR-PKP-04: a staff T1 swap changes the saved serial and the borrower's pickup screen", async ({
  page,
}) => {
  const f = await approvedRequest(page, `Swap ${test.info().testId.slice(-8)}`, true);
  const prepared = await prepareAtCounter(page, f.type.name!);
  try {
    await page.goto(`/staff/handover/${prepared.usageKey}`);
    await page
      .getByLabel("New unit's resource key")
      .fill(String(f.alternative.resourceKey));
    await page
      .locator("#swap-reason")
      .fill("Borrower requests the other unit before collection");
    const response = mutationResponse(page, "loan.swapUnit");
    await page.getByRole("button", { name: "Confirm swap", exact: true }).click();
    const swapped = await mutationData(await response, loanOutput);
    expect(swapped).toMatchObject({
      usageKey: prepared.usageKey,
      status: "Prepared",
      resourceKey: f.alternative.resourceKey,
      serialNo: f.alternative.serialNo,
    });
    await expect(page.getByRole("status")).toHaveText("Unit swapped successfully");
    const persisted = await liveCall(page.request, "loan.getForStaff", loanOutput, {
      usageKey: prepared.usageKey,
    });
    expect(persisted.resourceKey).toBe(f.alternative.resourceKey);
    const units = await liveCall(page.request, "item.listUnits", itemUnit.array(), {
      id: f.type.id,
      startTime: f.input.startTime,
      endTime: f.input.endTime,
    });
    expect(
      units.find((unit) => unit.resourceKey === f.unit.resourceKey)?.availableForWindow
    ).toBe(true);
    expect(
      units.find((unit) => unit.resourceKey === f.alternative.resourceKey)
        ?.availableForWindow
    ).toBe(false);
    await advanceBusinessClock(page, f.input.startTime);
    await visitAs(page, "borrower", "/pickup");
    await expect(
      page.getByRole("checkbox", { name: f.type.name!, exact: true })
    ).toBeChecked();
    await expect(
      page.getByText(f.alternative.serialNo, { exact: false }).first()
    ).toBeVisible();
    await expect(page.getByText(f.unit.serialNo, { exact: false })).toHaveCount(0);
    const mine = await liveCall(page.request, "loan.getById", requestOutput, {
      reservationKey: f.reservation.reservationKey,
    });
    expect(mine.resource).toMatchObject({
      resourceKey: f.alternative.resourceKey,
      serialNo: f.alternative.serialNo,
    });
  } finally {
    await expireRequest(page, f.reservation.expiresAt!);
  }
});

for (const prepared of [false, true]) {
  test(`FR-PKP-05: releases an ${prepared ? "already prepared" : "unprepared"} no-show after the pickup deadline`, async ({
    page,
  }) => {
    const f = await approvedRequest(
      page,
      `No-show ${prepared ? "prepared" : "unprepared"} ${test.info().testId.slice(-8)}`
    );
    if (prepared) await prepareAtCounter(page, f.type.name!);
    // The hold remains valid at the exact deadline; it expires immediately afterwards.
    await advanceBusinessClock(page, f.reservation.expiresAt!);
    await visitAs(page, "admin", "/admin/status");
    const job = page.getByRole("row").filter({ hasText: "expireStaleRequests" });
    const boundaryRun = mutationResponse(page, "admin.runCronJob");
    await job.getByRole("button", { name: "Run now", exact: true }).click();
    await mutationData(await boundaryRun, okOutput);
    await login(page.request, "borrower");
    const held = await liveCall(page.request, "loan.getById", requestOutput, {
      reservationKey: f.reservation.reservationKey,
    });
    expect(held.status).toBe(prepared ? "ready" : "approved");

    await advanceBusinessClock(
      page,
      new Date(Date.parse(f.reservation.expiresAt!) + 1).toISOString()
    );
    await visitAs(page, "admin", "/admin/status");
    const release = mutationResponse(page, "admin.runCronJob");
    await job.getByRole("button", { name: "Run now", exact: true }).click();
    await mutationData(await release, okOutput);
    await expect(job.getByText("Success", { exact: true })).toBeVisible();
    await visitAs(page, "borrower", "/my/loans");
    const cancelled = await liveCall(page.request, "loan.getById", requestOutput, {
      reservationKey: f.reservation.reservationKey,
    });
    expect(cancelled).toMatchObject({ status: "cancelled", usageKey: null });
    await page.getByRole("tab", { name: /^History/ }).click();
    const card = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: f.type.name!, exact: true }) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Cancelled");
    const units = await liveCall(page.request, "item.listUnits", itemUnit.array(), {
      id: f.type.id,
      startTime: new Date(Date.parse(f.reservation.expiresAt!) + 3_600_000).toISOString(),
      endTime: f.input.endTime,
    });
    expect(units.find((unit) => unit.resourceKey === f.unit.resourceKey)).toMatchObject({
      status: "InStorage",
      availableForWindow: true,
      dueAt: null,
    });
  });
}
