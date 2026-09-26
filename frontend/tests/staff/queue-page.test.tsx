import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffQueuePage from "../../src/features/staff/queue/staff-queue-page";
import {
  staffQueueRow,
  staffQueueCounts,
  recordReturnOutput,
} from "../../../backend/src/loan/loan.schema";
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
  useUsagePhotos: vi.fn(),
  usePickupImageUpload: vi.fn(),
}));

vi.mock("../../src/features/staff/queue/use-staff-queue", () => mocks);
vi.mock("../../src/features/borrower/pickup/use-pickup-image-upload", () => ({
  useUsagePhotos: mocks.useUsagePhotos,
  usePickupImageUpload: mocks.usePickupImageUpload,
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
    mocks.useConfirmPickup.mockReturnValue(mutationResult(vi.fn()));
    mocks.useRecordReturn.mockReturnValue(mutationResult(recordReturn));
    mocks.useMarkLost.mockReturnValue(mutationResult(vi.fn()));
    mocks.useStaffDecideExtension.mockReturnValue(mutationResult(vi.fn()));
    mocks.useUsagePhotos.mockReturnValue(
      queryResult(
        usagePhotosOutput.strict().parse({ before: [], after: [], inspection: [] })
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
    fireEvent.click(returnButton);

    await waitFor(() => expect(recordReturn).toHaveBeenCalledWith({ usageKey: 9 }));
    expect(screen.getByRole("status")).toHaveTextContent("5");
  });
});
