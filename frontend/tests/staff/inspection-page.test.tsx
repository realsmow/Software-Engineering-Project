import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import StaffInspectionPage from "../../src/features/staff/inspection/inspection-page";
import {
  inspectionQueueRow,
  inspectionSubjectOutput,
} from "../../../backend/src/inspection/inspection.schema";
import { inspectionResponse } from "../fixtures/api-responses";
import { queryResult, mutationResult } from "../fixtures/query-results";

const hooks = vi.hoisted(() => ({
  useInspectionQueue: vi.fn(),
  useInspectionSubject: vi.fn(),
  useCreateInspection: vi.fn(),
  useUploadInspectionPhoto: vi.fn(),
}));

vi.mock("../../src/features/staff/inspection/use-inspection", () => hooks);

const row = inspectionQueueRow.strict().parse({
  usageKey: 42,
  borrowerName: "Ada Lovelace",
  borrowerStudentId: "S12345",
  itemName: "Oscilloscope",
  serialNo: "OSC-001",
  resourceKey: 7,
  tier: "T2",
  checkoutCondition: "Normal",
  returnedAt: "2026-09-25T09:00:00.000Z",
  overdueDays: 0,
  beforeImageCount: 1,
  afterImageCount: 1,
});

const subject = inspectionSubjectOutput.strict().parse({
  usageKey: 42,
  resourceKey: 7,
  itemName: "Oscilloscope",
  serialNo: "OSC-001",
  tier: "T2",
  creditWeight: 12,
  borrowerAccountKey: 10,
  borrowerName: "Ada Lovelace",
  borrowerStudentId: "S12345",
  borrowerCreditScore: 88,
  checkoutCondition: "Normal",
  checkoutConditionNote: "No marks at handover",
  checkoutAt: "2026-09-23T10:00:00.000Z",
  dueAt: "2026-09-25T10:00:00.000Z",
  returnedAt: "2026-09-25T09:00:00.000Z",
  overdueDays: 0,
  beforeImages: [{ imageKey: 1, url: "/media/before.jpg", submittedAt: null }],
  afterImages: [{ imageKey: 2, url: "/media/after.jpg", submittedAt: null }],
  unitHistory: [
    {
      conditionKey: 5,
      condition: "MinorDamage",
      note: "Old scratch",
      loggedAt: "2026-08-25T10:00:00.000Z",
    },
  ],
  existingInspectionKey: null,
});

describe("StaffInspectionPage", () => {
  const create = vi.fn();
  const upload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("en");
    hooks.useInspectionQueue.mockReturnValue(queryResult([row]));
    hooks.useInspectionSubject.mockReturnValue(queryResult(subject));
    hooks.useCreateInspection.mockReturnValue(mutationResult(create));
    hooks.useUploadInspectionPhoto.mockReturnValue(mutationResult(upload));
  });

  it("shows the returned-item backlog and loads detail only when opened", () => {
    const { container } = render(<StaffInspectionPage />);

    expect(screen.getByText("Oscilloscope")).toBeInTheDocument();
    expect(hooks.useInspectionSubject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Oscilloscope/ }));
    expect(hooks.useInspectionSubject).toHaveBeenCalledWith(42);
    expect(screen.getByText(i18n.t("staff.inspection.atHandover"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("staff.inspection.atReturn"))).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("img")).map((image) =>
        image.getAttribute("src")
      )
    ).toEqual(["/media/before.jpg", "/media/after.jpg"]);
    expect(screen.getByText("Old scratch")).toBeInTheDocument();
  });

  it("requires a grade and submits the selected condition with the note", async () => {
    create.mockResolvedValue(
      inspectionResponse({
        level: "B2",
        condition: "MajorDamage",
        note: "Screen cracked",
        penalty: {
          penaltyKey: 16,
          creditDeducted: 36,
          expiresAt: "2026-12-07T01:00:00.000Z",
        },
        returnedToPool: false,
      })
    );
    render(<StaffInspectionPage />);
    fireEvent.click(screen.getByRole("button", { name: /Oscilloscope/ }));

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.inspection.recordGrade") })
    );
    expect(screen.getByText(i18n.t("staff.inspection.pickGrade"))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /B2/ }));
    fireEvent.change(
      screen.getByPlaceholderText(i18n.t("staff.inspection.notePlaceholder")),
      {
        target: { value: "Screen cracked" },
      }
    );
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.inspection.recordGrade") })
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        usageKey: 42,
        level: "B2",
        note: "Screen cracked",
      })
    );
    expect(screen.getByText(/36/)).toBeInTheDocument();
  });

  it("uploads a chosen photo and files its URL with the grade (#137)", async () => {
    upload.mockResolvedValue("/media/inspection-1.jpg");
    create.mockResolvedValue(
      inspectionResponse({ level: "B1", condition: "MinorDamage", returnedToPool: true })
    );
    URL.createObjectURL = vi.fn(() => "blob:preview");
    const { container } = render(<StaffInspectionPage />);
    fireEvent.click(screen.getByRole("button", { name: /Oscilloscope/ }));

    const file = new File([new Uint8Array(8)], "after.jpg", { type: "image/jpeg" });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(upload).toHaveBeenCalledWith({ usageKey: 42, file })
    );

    fireEvent.click(screen.getByRole("button", { name: /B1/ }));
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("staff.inspection.recordGrade") })
    );
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        usageKey: 42,
        level: "B1",
        imageUrls: ["/media/inspection-1.jpg"],
      })
    );
  });

  it("does not offer a second grade when the server says the return was inspected", () => {
    hooks.useInspectionSubject.mockReturnValue(
      queryResult(
        inspectionSubjectOutput.strict().parse({ ...subject, existingInspectionKey: 13 })
      )
    );
    render(<StaffInspectionPage />);
    fireEvent.click(screen.getByRole("button", { name: /Oscilloscope/ }));

    expect(
      screen.getByText(i18n.t("staff.inspection.alreadyGraded", { key: 13 }))
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("staff.inspection.recordGrade") })
    ).not.toBeInTheDocument();
  });
});
