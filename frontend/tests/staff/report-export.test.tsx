import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import ReportExportPage from "../../src/features/reports/export/export-page";
import * as reportHooks from "../../src/features/admin/reports/use-reports";
import { reportSummaryOutput } from "../../../backend/src/report/report.schema";
import { queryResult } from "../fixtures/query-results";

vi.mock("../../src/features/admin/reports/use-reports", () => ({
  useReportSummary: vi.fn(),
}));

const report = reportSummaryOutput.strict().parse({
  generatedAt: "2026-09-26T03:00:00.000Z",
  unscoped: false,
  totals: { loans: 3, overdue: 1, unitsHeld: 5, unitsOut: 2 },
  departments: [
    {
      manageGroupKey: 8,
      name: 'วิศวกรรม "A"',
      loans: 3,
      overdue: 1,
      unitsHeld: 5,
      unitsOut: 2,
      utilization: 40,
    },
  ],
  damage: [],
  roomUtilization: { rooms: 0, bookedHours: 0, openHours: 0, percent: 0 },
  topEquipment: [{ itemKey: 11, name: "Multimeter", tier: "T1", count: 2 }],
});

async function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("staff report export regression", () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:report");
  const revokeObjectURL = vi.fn();
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    vi.mocked(reportHooks.useReportSummary).mockReturnValue(queryResult(report));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    click.mockRestore();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("exports scoped report data as a UTF-8 CSV with escaped names", async () => {
    render(<ReportExportPage />);

    expect(screen.getByText(i18n.t("reports.export.scopeMine"))).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: i18n.t("reports.export.download") })[0]
    );

    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    const csv = await blobText(createObjectURL.mock.calls[0][0] as Blob);
    expect(csv).toContain(
      '"department","loans","overdue","units_held","units_out","utilization_percent"'
    );
    expect(csv).toContain('"วิศวกรรม ""A""","3","1","5","2","40"');
  });

  it("disables downloads when the report has no rows", () => {
    vi.mocked(reportHooks.useReportSummary).mockReturnValue(
      queryResult(
        reportSummaryOutput.strict().parse({
          ...report,
          departments: [],
          topEquipment: [],
          totals: { loans: 0, overdue: 0, unitsHeld: 0, unitsOut: 0 },
        })
      )
    );
    render(<ReportExportPage />);
    for (const button of screen.getAllByRole("button", {
      name: i18n.t("reports.export.download"),
    })) {
      expect(button).toBeDisabled();
    }
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
