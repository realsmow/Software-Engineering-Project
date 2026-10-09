import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffQueuePage from "../../src/features/staff/queue/staff-queue-page";
import {
  staffQueueRow,
  staffQueueCounts,
  recordReturnOutput,
  extensionReviewRow,
} from "../../../backend/src/loan/loan.schema";
import type { StaffQueueBucket } from "../../src/features/staff/queue/queue.types";
import { usagePhotosOutput } from "../../../backend/src/image/image.schema";
import { loanResponse } from "../fixtures/api-responses";
import { queryResult, mutationResult } from "../fixtures/query-results";

const mocks = vi.hoisted(() => ({
  useStaffQueueCounts: vi.fn(),
  useStaffQueue: vi.fn(),
  useStaffExtensionQueue: vi.fn(),
  useAllocate: vi.fn(),
  useConfirmPickup: vi.fn(),
  useRecordReturn: vi.fn(),
  useMarkLost: vi.fn(),
  useStaffDecideExtension: vi.fn(),
  useStaffInspectExtension: vi.fn(),
  usePrepareOptions: vi.fn(),
  useCopyGroupPhotos: vi.fn(),
  useUsagePhotos: vi.fn(),
  usePickupImageUpload: vi.fn(),
  detachPhoto: vi.fn(),
}));

vi.mock("../../src/features/staff/queue/use-staff-queue", () => mocks);
vi.mock("../../src/features/borrower/pickup/use-pickup-image-upload", () => ({
  useUsagePhotos: mocks.useUsagePhotos,
  usePickupImageUpload: mocks.usePickupImageUpload,
  useDetachUsagePhoto: () => ({ mutateAsync: mocks.detachPhoto, isPending: false }),
}));

const row = staffQueueRow.strict().parse({
  usageKey: null,
  reservationKey: 77,
  status: null,
  borrower: {
    accountKey: 42,
    studentId: "S12345",
    firstName: "Ada",
    lastName: "Lovelace",
    creditScore: 88,
  },
  itemName: "Oscilloscope",
  serialNo: null,
  resourceKey: 7,
  tier: "T2",
  prepDays: 1,
  pickupAt: "2026-10-01T06:00:00.000Z",
  dueAt: "2026-10-02T06:00:00.000Z",
  overdueDays: 0,
  lostEligible: false,
});

describe("StaffQueuePage", () => {
  const allocate = vi.fn();
  const copyPhotos = vi.fn();
  const recordReturn = vi.fn();

  const renderPage = () =>
    render(
      <MemoryRouter>
        <StaffQueuePage />
      </MemoryRouter>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("en");
    mocks.useStaffQueueCounts.mockReturnValue(
      queryResult(
        staffQueueCounts.strict().parse({
          toPrepare: 1,
          toHandover: 0,
          onLoan: 0,
          overdue: 0,
          toInspect: 0,
          extensionsToInspect: 0,
        })
      )
    );
    mocks.useStaffQueue.mockReturnValue(queryResult([row]));
    mocks.useStaffExtensionQueue.mockReturnValue(queryResult([]));
    mocks.useAllocate.mockReturnValue(mutationResult(allocate));
    mocks.usePrepareOptions.mockReturnValue(queryResult([]));
    mocks.useCopyGroupPhotos.mockReturnValue(mutationResult(copyPhotos));
    mocks.useConfirmPickup.mockReturnValue(mutationResult(vi.fn()));
    mocks.useRecordReturn.mockReturnValue(mutationResult(recordReturn));
    mocks.useMarkLost.mockReturnValue(mutationResult(vi.fn()));
    mocks.useStaffDecideExtension.mockReturnValue(mutationResult(vi.fn()));
    mocks.useStaffInspectExtension.mockReturnValue(mutationResult(vi.fn()));
    mocks.useUsagePhotos.mockReturnValue(
      queryResult(
        usagePhotosOutput
          .strict()
          .parse({ before: [], after: [], inspection: [], evidence: [] })
      )
    );
    mocks.usePickupImageUpload.mockReturnValue(mutationResult(vi.fn()));
  });

  it("shows the scoped preparation queue and searches by borrower on the server", () => {
    renderPage();

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Oscilloscope")).toBeInTheDocument();
    expect(mocks.useStaffQueue).toHaveBeenCalledWith("toPrepare", "");

    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("staff.queue.searchPlaceholder")),
      {
        target: { value: "S12345" },
      }
    );
    expect(mocks.useStaffQueue).toHaveBeenLastCalledWith("toPrepare", "S12345");
  });

  it("leaves the extensions pile from a bucket tile or the back button (#158)", () => {
    renderPage();
    const extTile = () =>
      screen.getByRole("button", { name: new RegExp(i18n.t("staff.queue.tileExtensions")) });

    fireEvent.click(extTile());
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /To prepare/i })[0]);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();

    fireEvent.click(extTile());
    fireEvent.click(screen.getByRole("button", { name: i18n.t("staff.queue.backToQueue") }));
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("lets staff record the condition on a supervisor-routed extension (#156)", async () => {
    const inspect = vi.fn().mockResolvedValue({});
    const decide = vi.fn();
    mocks.useStaffInspectExtension.mockReturnValue(mutationResult(inspect));
    mocks.useStaffDecideExtension.mockReturnValue(mutationResult(decide));
    mocks.useStaffExtensionQueue.mockReturnValue(
      queryResult([
        extensionReviewRow.strict().parse({
          extensionKey: 12,
          usageKey: 9,
          borrower: row.borrower,
          creditTier: "D1",
          route: "supervisor",
          itemName: "Oscilloscope",
          serialNo: "OSC-001",
          tier: "T2",
          extendNo: 1,
          previousDueAt: "2026-10-02T06:00:00.000Z",
          requestedDueAt: "2026-10-03T06:00:00.000Z",
          requestedAt: "2026-09-24T08:00:00.000Z",
          reason: null,
          status: "Pending",
          inspection: null,
        }),
      ])
    );
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(i18n.t("staff.queue.tileExtensions")) }));
    const line = within(screen.getByText("Oscilloscope").closest("tr")!);
    fireEvent.change(line.getByRole("combobox"), { target: { value: "MajorDamage" } });
    fireEvent.click(line.getByRole("button", { name: i18n.t("staff.queue.extRecordCheck") }));

    await waitFor(() =>
      expect(inspect).toHaveBeenCalledWith({ extensionKey: 12, condition: "MajorDamage" })
    );
    expect(decide).not.toHaveBeenCalled();
  });

  it("allocates the selected request and reports the assigned serial", async () => {
    allocate.mockResolvedValue(
      loanResponse({
        usageKey: 9,
        reservationKey: row.reservationKey,
        borrower: row.borrower,
        itemName: row.itemName,
        resourceKey: 7,
        tier: "T2",
        serialNo: "OSC-001",
        checkoutAt: row.pickupAt!,
        dueAt: row.dueAt!,
      })
    );
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.queue.actionPrepare") })
    );

    await waitFor(() => expect(allocate).toHaveBeenCalledWith({ reservationKey: 77 }));
    expect(screen.getByRole("status")).toHaveTextContent("OSC-001");
  });

  it("lets staff choose which unit to set aside (demo feedback)", async () => {
    mocks.usePrepareOptions.mockReturnValue(
      queryResult([
        { resourceKey: 7, serialNo: "OSC-001", reserved: true },
        { resourceKey: 8, serialNo: "OSC-002", reserved: false },
      ])
    );
    allocate.mockResolvedValue(
      loanResponse({
        usageKey: 9,
        reservationKey: row.reservationKey,
        borrower: row.borrower,
        itemName: row.itemName,
        resourceKey: 8,
        tier: "T2",
        serialNo: "OSC-002",
        checkoutAt: row.pickupAt!,
        dueAt: row.dueAt!,
      })
    );
    renderPage();
    const unit = screen.getByRole("combobox", { name: i18n.t("staff.queue.pickUnit") });
    expect(unit).toHaveValue("7");
    fireEvent.change(unit, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("staff.queue.actionPrepare") }));
    await waitFor(() =>
      expect(allocate).toHaveBeenCalledWith({ reservationKey: 77, resourceKey: 8 })
    );
  });

  describe("demo feedback: one submit for several units is one row", () => {
    const four = [77, 78, 79, 80].map((reservationKey) => ({ ...row, reservationKey }));

    it("prepares all units of the group with one click", async () => {
      mocks.useStaffQueue.mockReturnValue(queryResult(four));
      allocate.mockResolvedValue(
        loanResponse({
          usageKey: 9,
          reservationKey: 77,
          borrower: row.borrower,
          itemName: row.itemName,
          resourceKey: 7,
          tier: "T2",
          serialNo: "OSC-001",
          checkoutAt: row.pickupAt!,
          dueAt: row.dueAt!,
        })
      );
      renderPage();
      expect(screen.getAllByText("Ada Lovelace")).toHaveLength(1);
      expect(screen.getByText("×4")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: i18n.t("staff.queue.prepareAll", { count: 4 }) })
      );
      await waitFor(() => expect(allocate).toHaveBeenCalledTimes(4));
      expect(allocate.mock.calls.map(([input]) => input.reservationKey)).toEqual([
        77, 78, 79, 80,
      ]);
    });

    it("splits the group back into separate rows", () => {
      mocks.useStaffQueue.mockReturnValue(queryResult(four));
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: i18n.t("staff.queue.split") }));
      expect(screen.getAllByText("Ada Lovelace")).toHaveLength(4);
    });
  });

  describe("same display name does not identify a request group", () => {
    describe("different tiers under the same display name", () => {
      beforeEach(() => {
        // Different ResourceKey/ReservationKey stand for distinct ItemKeys.
        // The queue DTO exposes only itemName, which is not unique in SQL.
        const rows = [
          staffQueueRow
            .strict()
            .parse({ ...row, tier: "T1", resourceKey: 7, reservationKey: 77 }),
          staffQueueRow
            .strict()
            .parse({ ...row, tier: "T2", resourceKey: 8, reservationKey: 78 }),
        ];
        mocks.useStaffQueue.mockReturnValue(queryResult(rows));
        renderPage();
        expect(mocks.useStaffQueue).toHaveBeenCalledWith("toPrepare", "");
        expect(screen.getAllByText("Oscilloscope").length).toBeGreaterThan(0);
      });
      it.fails(
        "keeps distinct equipment types with identical names in separate rows",
        () => {
          expect(screen.getAllByText("Ada Lovelace")).toHaveLength(2);
          expect(screen.queryByText("×2")).not.toBeInTheDocument();
          expect(
            screen.getAllByRole("button", { name: i18n.t("staff.queue.actionPrepare") })
          ).toHaveLength(2);
        }
      );
    });

    it("keeps differently named types separate and acts on only the selected reservation", async () => {
      mocks.useStaffQueue.mockReturnValue(
        queryResult([
          staffQueueRow.strict().parse({ ...row, tier: "T1", reservationKey: 77 }),
          staffQueueRow
            .strict()
            .parse({
              ...row,
              itemName: "Multimeter",
              resourceKey: 8,
              reservationKey: 78,
            }),
        ])
      );
      allocate.mockResolvedValue(loanResponse({ usageKey: 9, reservationKey: 77 }));
      renderPage();
      expect(screen.getAllByText("Ada Lovelace")).toHaveLength(2);
      expect(screen.queryByText("×2")).not.toBeInTheDocument();
      fireEvent.click(
        screen.getAllByRole("button", { name: i18n.t("staff.queue.actionPrepare") })[0]
      );
      await waitFor(() => expect(allocate).toHaveBeenCalledWith({ reservationKey: 77 }));
      expect(allocate).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a failed allocation without losing the queue row", async () => {
    allocate.mockRejectedValue(new Error("The unit is no longer available"));
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.queue.actionPrepare") })
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "The unit is no longer available"
      )
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("blocks return without an after photo and displays the late penalty after return", async () => {
    mocks.useStaffQueue.mockImplementation((bucket: string) =>
      queryResult(
        bucket === "onLoan"
          ? [
              staffQueueRow.strict().parse({
                ...row,
                usageKey: 9,
                reservationKey: 77,
                status: "Lended",
                serialNo: "OSC-001",
                pickupAt: "2026-09-23T06:00:00.000Z",
                dueAt: "2026-09-24T06:00:00.000Z",
                overdueDays: 2,
              }),
            ]
          : [row]
      )
    );
    recordReturn.mockResolvedValue(
      recordReturnOutput.strict().parse({
        loan: loanResponse({
          usageKey: 9,
          reservationKey: 77,
          borrower: row.borrower,
          itemName: row.itemName,
          serialNo: "OSC-001",
          resourceKey: 7,
          tier: "T2",
          status: "Returned",
          checkoutAt: "2026-09-23T06:00:00.000Z",
          dueAt: "2026-09-24T06:00:00.000Z",
          returnedAt: "2026-09-26T06:00:00.000Z",
          overdueDays: 2,
        }),
        latePenalty: {
          penaltyKey: 3,
          creditDeducted: 5,
          overdueDays: 2,
          expiresAt: "2026-10-10T00:00:00Z",
        },
      })
    );
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: /On loan/i })[0]);
    const returnButton = screen.getByRole("button", {
      name: i18n.t("staff.queue.actionReturn"),
    });
    expect(returnButton).toBeDisabled();
    expect(recordReturn).not.toHaveBeenCalled();

    mocks.useUsagePhotos.mockReturnValue(
      queryResult(
        usagePhotosOutput.strict().parse({
          before: [],
          after: [
            {
              imageKey: 1,
              imageUrl: "/media/after.jpg",
              stage: "after",
              submittedBy: 42,
              submittedAt: "2026-09-26T06:00:00.000Z",
            },
          ],
          inspection: [],
          evidence: [],
        })
      )
    );
    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("staff.queue.searchPlaceholder")),
      {
        target: { value: "Ada" },
      }
    );
    expect(returnButton).toBeEnabled();
    // Demo feedback: staff can open the photo and remove it to retake.
    expect(screen.getByRole("link", { name: i18n.t("common.viewPhoto") })).toHaveAttribute(
      "href",
      "/media/after.jpg"
    );
    fireEvent.click(screen.getByRole("button", { name: i18n.t("borrower.pickup.removePhoto") }));
    expect(mocks.detachPhoto).toHaveBeenCalledWith({ usageKey: 9, imageKey: 1 });
    fireEvent.click(returnButton);

    await waitFor(() => expect(recordReturn).toHaveBeenCalledWith({ usageKey: 9 }));
    expect(screen.getByRole("status")).toHaveTextContent("5");
  });

  describe("Work queue navigation", () => {
    const buckets = [
      { bucket: "toPrepare", label: "staff.queue.bucketToPrepare" },
      { bucket: "toHandover", label: "staff.queue.bucketToHandover" },
      { bucket: "onLoan", label: "staff.queue.bucketOnLoan" },
      { bucket: "overdue", label: "staff.queue.bucketOverdue" },
    ] as const;
    const extension = extensionReviewRow.strict().parse({
      extensionKey: 12,
      usageKey: 9,
      borrower: row.borrower,
      creditTier: "D1",
      route: "staff",
      itemName: "QA extension equipment",
      serialNo: "EXT-001",
      tier: "T1",
      extendNo: 2,
      previousDueAt: "2026-10-02T06:00:00.000Z",
      requestedDueAt: "2026-10-03T06:00:00.000Z",
      requestedAt: "2026-09-24T08:00:00.000Z",
      reason: null,
      status: "Pending",
    });
    const tile = (label: string) =>
      screen.getByRole("button", { name: new RegExp(`^${i18n.t(label)}\\s`) });
    const backButton = () =>
      screen.getByRole("button", { name: i18n.t("staff.queue.backToQueue") });
    const expectQueue = (bucket: StaffQueueBucket) => {
      expect(screen.queryByText(`QA queue ${bucket}`)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: i18n.t("staff.queue.backToQueue") })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(extension.itemName!)).not.toBeInTheDocument();
      expect(
        screen.queryByText(i18n.t("staff.queue.extEmptyTitle"))
      ).not.toBeInTheDocument();
    };

    beforeEach(() => {
      mocks.useStaffQueue.mockImplementation((bucket: StaffQueueBucket) =>
        queryResult([
          staffQueueRow.strict().parse({
            ...row,
            itemName: `QA queue ${bucket}`,
            usageKey: bucket === "toPrepare" ? null : 9,
            reservationKey: bucket === "toPrepare" ? 77 : null,
            status:
              bucket === "toPrepare"
                ? null
                : bucket === "toHandover"
                  ? "Prepared"
                  : "Lended",
            serialNo: bucket === "toPrepare" ? null : "QUEUE-001",
            overdueDays: bucket === "overdue" ? 2 : 0,
          }),
        ])
      );
    });

    it.each(buckets)(
      "switches to $bucket using its count tile from the main queue",
      ({ bucket, label }) => {
        renderPage();
        expectQueue("toPrepare");
        fireEvent.click(tile(label));
        expect(mocks.useStaffQueue).toHaveBeenLastCalledWith(bucket, "");
        expectQueue(bucket);
      }
    );

    describe.each(["populated", "empty"] as const)("%s extensions queue", (contents) => {
      let mounted: ReturnType<typeof renderPage>;
      beforeEach(() => {
        mocks.useStaffExtensionQueue.mockReturnValue(
          queryResult(contents === "populated" ? [extension] : [])
        );
        mocks.useStaffQueueCounts.mockReturnValue(
          queryResult(
            staffQueueCounts.strict().parse({
              toPrepare: 1,
              toHandover: 1,
              onLoan: 1,
              overdue: 1,
              toInspect: 0,
              extensionsToInspect: contents === "populated" ? 1 : 0,
            })
          )
        );
        mounted = renderPage();
        expectQueue("toPrepare");
        fireEvent.click(tile("staff.queue.tileExtensions"));
        expect(
          screen.getByText(
            contents === "populated"
              ? extension.itemName!
              : i18n.t("staff.queue.extEmptyTitle")
          )
        ).toBeInTheDocument();
      });

      it("starts in the main queue after the page is unmounted and reopened", () => {
        mounted.unmount();
        renderPage();
        expectQueue("toPrepare");
      });

      it("QA-STF-02: displays a usable Back to the main queue action", () => {
        expect(backButton()).toBeEnabled();
        fireEvent.click(backButton());
        expectQueue("toPrepare");
      });

      describe.each(buckets)("QA-STF-01 / extensions to $bucket", ({ bucket, label }) => {
        beforeEach(() => {
          fireEvent.click(tile(label));
          // Verify the click reaches the target hook outside the defect marker.
          expect(mocks.useStaffQueue).toHaveBeenLastCalledWith(bucket, "");
          for (const hook of [
            mocks.useAllocate,
            mocks.useConfirmPickup,
            mocks.useRecordReturn,
            mocks.useMarkLost,
            mocks.useStaffDecideExtension,
            mocks.usePickupImageUpload,
          ]) {
            // A hook this view never rendered cannot have fired either.
            const last = hook.mock.results.at(-1);
            if (last) expect(last.value.mutateAsync).not.toHaveBeenCalled();
          }
        });

        it("shows the selected main queue after clicking its count tile", () => {
          expectQueue(bucket);
        });
      });
    });
  });
});
