import { expect, test } from "../fixtures/api-contracts";
import {
  liveCall,
  login,
  visitAs,
  freshEquipment,
  mutationResponse,
  mutationData,
  pngFile,
  advanceBusinessClock,
} from "../fixtures/live-workflow";
import {
  createRequestOutput,
  requestOutput,
  loanOutput,
  recordReturnOutput,
  extensionOptionsOutput,
} from "../../../backend/src/loan/loan.schema";
import { creditOutput } from "../../../backend/src/credit/credit.schema";
import { paginatedNotifications } from "../../../backend/src/notification/notification.schema";
import {
  itemDetail,
  roomOutput,
  eligibilityRule,
  roomAvailabilityOutput,
} from "../../../backend/src/item/item.schema";
import { appealOutput } from "../../../backend/src/appeal/appeal.schema";
import {
  requestUploadOutput,
  usagePhotosOutput,
} from "../../../backend/src/image/image.schema";
import {
  borrowerHistoryOutput,
  decideApprovalOutput,
} from "../../../backend/src/approval/approval.schema";
import {
  inspectionOutput,
  repairOutput,
} from "../../../backend/src/inspection/inspection.schema";

test.describe("live lending lifecycle across roles", () => {
  test.beforeEach(({ page }) => page.setDefaultTimeout(10_000));
  for (const revisedGrade of ["B0", "B1"] as const) {
    test(`T2 approval, collection, extension, inspection, ${revisedGrade} appeal and repair update real state`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const name = `Lifecycle T2 ${test.info().testId}`;
      const appealReason = `The scratch existed before collection of ${name}; compare the stored photos.`;
      const fixture = await freshEquipment(page.request, name);
      const borrower = await login(page.request, "borrower");
      const created = await liveCall(
        page.request,
        "loan.create",
        createRequestOutput,
        {
          startTime: "2031-09-26T01:00:00.000Z",
          endTime: "2031-09-27T10:00:00.000Z",
          lines: [{ resourceKey: fixture.unit.resourceKey }],
        },
        true,
      );
      expect(created.rejected).toEqual([]);
      expect(created.created).toHaveLength(1);
      const reservationKey = created.created[0].reservationKey;
      expect(created.created[0].approval.route).toBe("supervisor");

      await visitAs(page, "supervisor", "/supervisor/approvals");
      const approvalRow = page.getByRole("row").filter({ hasText: name });
      await expect(approvalRow).toBeVisible();
      const historyResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname.includes("approval.borrowerHistory"),
      );
      await approvalRow
        .getByText(`${borrower.firstName} ${borrower.lastName}`, {
          exact: true,
        })
        .click();
      const history = await mutationData(
        await historyResponse,
        borrowerHistoryOutput,
      );
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(
        `${borrower.firstName} ${borrower.lastName}`,
      );
      for (const [label, count] of [
        ["Total loans", history.totalLoans],
        ["Late returns", history.lateReturns],
        ["Damage (B1 or worse)", history.damageIncidents],
      ] as const) {
        await expect(
          dialog.getByText(label, { exact: true }).locator(".."),
        ).toContainText(String(count));
      }
      if (history.items.length)
        await expect(
          dialog
            .getByRole("row")
            .filter({ hasText: history.items[0].itemName })
            .first(),
        ).toBeVisible();
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const approve = mutationResponse(page, "approval.decide");
      await approvalRow
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      expect((await approve).ok()).toBeTruthy();

      await visitAs(page, "staff", "/staff");
      await page.locator('input[type="search"]').fill(name);
      const preparation = page
        .getByRole("row")
        .filter({ hasText: name })
        .first();
      const allocate = mutationResponse(page, "loan.allocate");
      await preparation
        .getByRole("button", { name: "Prepare", exact: true })
        .click();
      const prepared = await mutationData(await allocate, loanOutput);
      expect(prepared.status).toBe("Prepared");

      await advanceBusinessClock(page, "2031-09-26T01:00:00.000Z");
      await visitAs(page, "borrower", "/pickup");
      const checkbox = page.getByRole("checkbox", { name, exact: true });
      await expect(checkbox).toBeChecked();
      const collect = page.getByRole("button", { name: "Confirm collection" });
      await expect(collect).toBeDisabled();
      await page
        .locator('input[type="file"]')
        .setInputFiles(pngFile("borrower-before.png"));
      await expect(collect).toBeEnabled();
      const confirmation = mutationResponse(page, "loan.confirmMyPickup");
      await collect.click();
      expect(
        (await mutationData(await confirmation, requestOutput)).status,
      ).toBe("inUse");
      await expect(page).toHaveURL("/my/loans");
      await page.getByRole("tab", { name: /^On loan/ }).click();
      const card = page.getByRole("article").filter({ hasText: name });
      await card
        .getByRole("button", { name: "Request extension", exact: true })
        .click();
      const renewal = mutationResponse(page, "loan.requestExtension");
      await card
        .getByRole("button", { name: "Confirm - send to supervisor" })
        .click();
      expect((await renewal).ok()).toBeTruthy();

      await visitAs(page, "supervisor", "/supervisor/approvals");
      await page.getByRole("tab", { name: /Extensions/ }).click();
      const extensionRow = page.getByRole("row").filter({ hasText: name });
      const decideExtension = mutationResponse(
        page,
        "approval.decideExtension",
      );
      await extensionRow
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      expect((await decideExtension).ok()).toBeTruthy();
      await login(page.request, "borrower");
      const renewed = await liveCall(
        page.request,
        "loan.getById",
        requestOutput,
        { reservationKey },
      );
      expect(Date.parse(renewed.dueAt!)).toBeGreaterThan(
        Date.parse(prepared.dueAt),
      );

      await visitAs(page, "staff", "/staff");
      await page.getByRole("button", { name: /^On loan/ }).click();
      await page.locator('input[type="search"]').fill(name);
      const returnRow = page.getByRole("row").filter({ hasText: name }).first();
      await returnRow
        .locator('input[type="file"]')
        .setInputFiles(pngFile("return.png"));
      await expect(returnRow.getByText("Photo taken")).toBeVisible();
      const recordReturn = mutationResponse(page, "loan.recordReturn");
      await returnRow
        .getByRole("button", { name: "Record return", exact: true })
        .click();
      expect(
        (await mutationData(await recordReturn, recordReturnOutput))
          .latePenalty,
      ).toBeNull();

      // The staff member who prepared T2 may not grade it. Admin is an
      // independent inspector here; the subsequent supervisor is neither one.
      await visitAs(page, "admin", "/staff/inspection");
      const inspectionCard = page
        .locator("section")
        .filter({ hasText: name })
        .first();
      await inspectionCard.getByRole("button").first().click();
      await inspectionCard.getByRole("button", { name: /^B2/ }).click();
      const inspect = mutationResponse(page, "inspection.create");
      await inspectionCard
        .getByRole("button", { name: "Record grade", exact: true })
        .click();
      expect((await inspect).ok()).toBeTruthy();
      await login(page.request, "borrower");
      const deducted = await liveCall(page.request, "credit.me", creditOutput);
      expect(deducted.score).toBeLessThan(100);
      const penalty = deducted.activePenalties.find(
        (row) => row.usageKey === prepared.usageKey,
      )!;
      expect(penalty).toBeDefined();

      await visitAs(page, "borrower", `/my/appeals?penalty=${penalty.id}`);
      await page
        .getByPlaceholder(
          "Explain how the real condition differs from the verdict - e.g. this scratch was there before I collected it…",
        )
        .fill(appealReason);
      const attachAppealPhoto = mutationResponse(
        page,
        "image.attachUsagePhotos",
      );
      await page
        .locator('input[type="file"]')
        .setInputFiles(pngFile("appeal.png"));
      expect((await attachAppealPhoto).ok()).toBeTruthy();
      const appeal = mutationResponse(page, "appeal.create");
      await page
        .getByRole("button", { name: "Submit appeal", exact: true })
        .click();
      const filed = await mutationData(await appeal, appealOutput);
      expect(filed.penalty.usageKey).toBe(prepared.usageKey);

      await visitAs(page, "supervisor", "/supervisor/appeals");
      const appealCard = page
        .locator("section")
        .filter({ hasText: appealReason })
        .first();
      await expect(appealCard.locator("img").first()).toBeVisible();
      await expect(appealCard).toContainText("B2");
      await expect(appealCard).toContainText(filed.inspection!.inspectorName);
      await expect
        .poll(() =>
          appealCard
            .locator("img")
            .first()
            .evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      const appealDecision = mutationResponse(page, "appeal.decide");
      await appealCard
        .getByRole("button", { name: new RegExp(`^${revisedGrade}`) })
        .click();
      await appealCard
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      const decided = await mutationData(await appealDecision, appealOutput);
      expect(decided.revisedGrade).toBe(revisedGrade);
      expect(decided.inspection?.grade).toBe("B2");
      const remaining = decided.replacementPenalty?.creditDeducted ?? 0;
      if (revisedGrade === "B0") {
        expect(decided.replacementPenalty).toBeNull();
      } else {
        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThan(penalty.creditDeducted!);
        expect(decided.replacementPenalty).toMatchObject({
          issuedAt: decided.penalty.issuedAt,
          expiresAt: decided.penalty.expiresAt,
        });
      }
      expect(decided.creditRestored).toBe(penalty.creditDeducted! - remaining);
      await page.reload();
      await page.getByRole("tab", { name: "Approved", exact: true }).click();
      await expect(appealCard).toContainText(revisedGrade);

      await login(page.request, "borrower");
      expect(
        (await liveCall(page.request, "credit.me", creditOutput)).score,
      ).toBe(deducted.score + decided.creditRestored);
      const notifications = await liveCall(
        page.request,
        "notification.list",
        paginatedNotifications,
        { page: 1, pageSize: 100 },
      );
      expect(
        notifications.items
          .filter((row) => row.body.includes(name))
          .map((row) => row.type),
      ).toEqual(
        expect.arrayContaining([
          "request_approved",
          "pickup_reminder",
          "appeal_result",
        ]),
      );
      expect(
        notifications.items.every((row) => row.userId === String(borrower.id)),
      ).toBe(true);

      await visitAs(page, "staff", "/staff/repairs");
      await page
        .getByRole("button", { name: "Send a unit for repair" })
        .click();
      await page.getByRole("button", { name: new RegExp(name) }).click();
      const repairTarget = page
        .locator("li")
        .filter({ hasText: `WF-${fixture.type.id}` });
      await expect(repairTarget).toBeVisible();
      const startRepair = mutationResponse(page, "inspection.startRepair");
      await repairTarget
        .getByRole("button", { name: "Send in", exact: true })
        .click();
      expect(
        (await mutationData(await startRepair, repairOutput)).resourceKey,
      ).toBe(fixture.unit.resourceKey);
      const repairCard = page
        .locator("section")
        .filter({ hasText: name })
        .first();
      await repairCard.getByRole("button").first().click();
      const finishRepair = mutationResponse(page, "inspection.finishRepair");
      await repairCard
        .getByRole("button", { name: "Close repair", exact: true })
        .click();
      expect((await finishRepair).ok()).toBeTruthy();
      await login(page.request, "borrower");
      const detail = await liveCall(page.request, "item.getById", itemDetail, {
        id: fixture.type.id,
      });
      expect(detail.units[0]).toMatchObject({
        allowBorrow: true,
        condition: "Normal",
        status: "InStorage",
      });
      expect(
        (
          await liveCall(page.request, "loan.getById", requestOutput, {
            reservationKey,
          })
        ).status,
      ).toBe("done");
    });
  }

  test("sends a damage-credit notification after independent inspection", async ({
    page,
  }) => {
    const name = `Damage alert ${test.info().testId}`;
    const fixture = await freshEquipment(page.request, name);
    await login(page.request, "borrower");
    const created = await liveCall(
      page.request,
      "loan.create",
      createRequestOutput,
      {
        startTime: "2031-09-26T01:00:00.000Z",
        endTime: "2031-09-27T10:00:00.000Z",
        lines: [{ resourceKey: fixture.unit.resourceKey }],
      },
      true,
    );
    expect(created.rejected).toEqual([]);
    const reservationKey = created.created[0].reservationKey;
    await login(page.request, "supervisor");
    await liveCall(
      page.request,
      "approval.decide",
      decideApprovalOutput,
      { reservationKey, decision: "approve" },
      true,
    );
    await login(page.request, "staff");
    const prepared = await liveCall(
      page.request,
      "loan.allocate",
      loanOutput,
      { reservationKey },
      true,
    );
    await advanceBusinessClock(page, "2031-09-26T01:00:00.000Z");
    await login(page.request, "borrower");
    for (const stage of ["before", "after"] as const) {
      const image = pngFile(`${stage}.png`);
      const ticket = await liveCall(
        page.request,
        "image.requestUsagePhotoUpload",
        requestUploadOutput,
        {
          usageKey: prepared.usageKey,
          stage,
          contentType: image.mimeType,
          sizeBytes: image.buffer.length,
        },
        true,
      );
      const upload = await page.request.put(ticket.uploadUrl, {
        data: image.buffer,
        headers: { "Content-Type": image.mimeType },
      });
      expect(upload.ok()).toBeTruthy();
      await liveCall(
        page.request,
        "image.attachUsagePhotos",
        usagePhotosOutput,
        { usageKey: prepared.usageKey, stage, imageUrls: [ticket.imageUrl] },
        true,
      );
      if (stage === "before")
        await liveCall(
          page.request,
          "loan.confirmMyPickup",
          requestOutput,
          { usageKey: prepared.usageKey },
          true,
        );
    }
    await login(page.request, "staff");
    await liveCall(
      page.request,
      "loan.recordReturn",
      recordReturnOutput,
      { usageKey: prepared.usageKey },
      true,
    );
    await login(page.request, "admin");
    const graded = await liveCall(
      page.request,
      "inspection.create",
      inspectionOutput,
      { usageKey: prepared.usageKey, level: "B2", imageUrls: [] },
      true,
    );
    expect(graded.penalty?.creditDeducted).toBeGreaterThan(0);
    await login(page.request, "borrower");
    expect(
      (await liveCall(page.request, "credit.me", creditOutput)).score,
    ).toBeLessThan(100);
    const notifications = await liveCall(
      page.request,
      "notification.list",
      paginatedNotifications,
      { page: 1, pageSize: 100 },
    );
    // Every prior transaction succeeded. This expected failure is restricted
    // to the missing event: inspection applies a penalty but emits no alert.
    test.fail(
      true,
      "FR-NTF-01: damage inspection does not emit creditDeducted",
    );
    expect(notifications.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "credit_deducted",
          body: expect.stringContaining(name),
        }),
      ]),
    );
  });

  test("supervisor rejection requires a reason and reaches the borrower without allocating stock", async ({
    page,
  }) => {
    const name = `Rejected T2 ${test.info().testId}`;
    const fixture = await freshEquipment(page.request, name);
    await login(page.request, "borrower");
    const created = await liveCall(
      page.request,
      "loan.create",
      createRequestOutput,
      {
        startTime: "2031-09-26T01:00:00.000Z",
        endTime: "2031-09-27T10:00:00.000Z",
        lines: [{ resourceKey: fixture.unit.resourceKey }],
      },
      true,
    );
    const key = created.created[0].reservationKey;
    await visitAs(page, "supervisor", "/supervisor/approvals");
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "Reject", exact: true }).click();
    const confirm = row
      .getByRole("button", { name: "Confirm reject", exact: true })
      .first();
    await expect(confirm).toBeDisabled();
    await row.locator("input").fill("Required for an exam");
    const decide = mutationResponse(page, "approval.decide");
    await confirm.click();
    expect((await decide).ok()).toBeTruthy();
    await login(page.request, "borrower");
    expect(
      await liveCall(page.request, "loan.getById", requestOutput, {
        reservationKey: key,
      }),
    ).toMatchObject({
      status: "rejected",
      usageKey: null,
      decisionNote: "Required for an exam",
    });
    const notifications = await liveCall(
      page.request,
      "notification.list",
      paginatedNotifications,
      { page: 1, pageSize: 100 },
    );
    expect(notifications.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "request_rejected",
          body: expect.stringContaining("Required for an exam"),
        }),
      ]),
    );
  });

  test("a browser room booking holds its slots and records both photos before staff return", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fixture = await freshEquipment(
      page.request,
      `Room support ${test.info().testId}`,
      "T1",
    );
    const name = `Workflow room ${test.info().testId}`;
    const room = await liveCall(
      page.request,
      "item.createRoom",
      roomOutput,
      {
        manageGroupKey: fixture.group.id,
        name,
        capacity: 12,
        openMinutes: 420,
        closeMinutes: 1080,
      },
      true,
    );
    await liveCall(
      page.request,
      "item.setEligibility",
      eligibilityRule.array(),
      {
        roomKey: room.roomKey,
        rules: [
          {
            groupKey: fixture.group.id,
            authorityRoleKey: fixture.borrowerRole.authorityRoleKey,
          },
        ],
      },
      true,
    );
    await visitAs(page, "borrower", `/rooms/${room.roomKey}/book`);
    await page.getByRole("button", { name: "08:00", exact: true }).click();
    await page.getByRole("button", { name: "08:30", exact: true }).click();
    const booking = mutationResponse(page, "loan.createRoomBooking");
    await page.getByRole("button", { name: "Submit booking request" }).click();
    const created = await mutationData(await booking, createRequestOutput);
    expect(created.created).toHaveLength(1);
    const reservationKey = created.created[0].reservationKey;
    const held = await liveCall(
      page.request,
      "item.roomAvailability",
      roomAvailabilityOutput,
      { roomKey: room.roomKey, date: "2031-09-26" },
    );
    expect(
      held.slots
        .filter((slot) => [2, 3].includes(slot.index))
        .every((slot) => !slot.available),
    ).toBe(true);
    await login(page.request, "staff");
    const prepared = await liveCall(
      page.request,
      "loan.allocate",
      loanOutput,
      { reservationKey },
      true,
    );
    await advanceBusinessClock(page, "2031-09-26T01:00:00.000Z");
    await visitAs(page, "borrower", "/rooms/use");
    const roomCard = page.locator("section").filter({ hasText: name }).first();
    const checkIn = roomCard.getByRole("button", {
      name: "Check in",
      exact: true,
    });
    await expect(checkIn).toBeDisabled();
    await roomCard
      .locator('input[type="file"]')
      .first()
      .setInputFiles(pngFile("room-before.png"));
    await expect(checkIn).toBeEnabled();
    const pickup = mutationResponse(page, "loan.confirmMyPickup");
    await checkIn.click();
    expect((await pickup).ok()).toBeTruthy();
    await expect(
      roomCard.getByText("Room in use", { exact: true }),
    ).toBeVisible();
    // FR-RNW-04: the actual API rejects renewal without moving the room deadline.
    expect(
      await liveCall(
        page.request,
        "loan.extensionOptions",
        extensionOptionsOutput,
        { usageKey: prepared.usageKey },
      ),
    ).toMatchObject({
      canRequest: false,
      blockedBy: "ROOM_NOT_EXTENDABLE",
      route: null,
    });
    const refused = await page.request.post(
      "http://localhost:3000/trpc/loan.requestExtension",
      {
        data: {
          usageKey: prepared.usageKey,
          requestedDueAt: "2031-09-26T02:30:00.000Z",
        },
      },
    );
    expect(refused.ok()).toBe(false);
    expect(JSON.stringify(await refused.json())).toContain(
      "ROOM_NOT_EXTENDABLE",
    );
    expect(
      (
        await liveCall(page.request, "loan.getById", requestOutput, {
          reservationKey,
        })
      ).dueAt,
    ).toBe(prepared.dueAt);
    await expect(
      roomCard.getByRole("button", { name: /Request extension/ }),
    ).toHaveCount(0);
    const after = mutationResponse(page, "image.attachUsagePhotos");
    await roomCard
      .locator('input[type="file"]')
      .nth(1)
      .setInputFiles(pngFile("room-after.png"));
    expect((await after).ok()).toBeTruthy();
    await expect(roomCard.getByText(/Staff close the booking/)).toBeVisible();
    await login(page.request, "staff");
    await liveCall(
      page.request,
      "loan.recordReturn",
      recordReturnOutput,
      { usageKey: prepared.usageKey },
      true,
    );
    // Returning early does not shorten the original reservation window.
    // The adjacent 09:00 slot must remain available for the next booking.
    await login(page.request, "borrower");
    expect(
      (
        await liveCall(page.request, "loan.getById", requestOutput, {
          reservationKey,
        })
      ).status,
    ).toBe("returned");
    const free = await liveCall(
      page.request,
      "item.roomAvailability",
      roomAvailabilityOutput,
      { roomKey: room.roomKey, date: "2031-09-26" },
    );
    expect(free.slots.find((slot) => slot.index === 3)?.available).toBe(false);
    expect(free.slots.find((slot) => slot.index === 4)?.available).toBe(true);
    // Returned rooms remain held until inspection completes the return.
    await login(page.request, "staff");
    await liveCall(
      page.request,
      "inspection.create",
      inspectionOutput,
      {
        usageKey: prepared.usageKey,
        level: "B0",
        imageUrls: [],
      },
      true,
    );
    await login(page.request, "borrower");
    // The one-active-booking rule lasts to the original end even on early return.
    await advanceBusinessClock(page, "2031-09-26T02:00:00.000Z");
    await page.goto(`/rooms/${room.roomKey}/book`);
    await page.getByRole("button", { name: "09:30", exact: true }).click();
    const nextBooking = mutationResponse(page, "loan.createRoomBooking");
    await page.getByRole("button", { name: "Submit booking request" }).click();
    const next = await mutationData(await nextBooking, createRequestOutput);
    expect(next.rejected).toEqual([]);
    expect(next.created).toHaveLength(1);
    expect(next.created[0].reservationKey).not.toBe(reservationKey);
    expect(Date.parse(next.created[0].startTime)).toBeGreaterThanOrEqual(
      Date.parse(created.created[0].endTime),
    );
  });
});
