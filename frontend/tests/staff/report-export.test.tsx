import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import ReportExportPage from "../../src/features/reports/export/export-page";
import * as reportHooks from "../../src/features/admin/reports/use-reports";
import { reportSummaryOutput } from "../../../backend/src/report/report.schema";
import {
  errorQueryResult,
  loadingQueryResult,
  queryResult,
} from "../fixtures/query-results";

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
  let filenames: string[];

  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.clearAllMocks();
    filenames = [];
    vi.mocked(reportHooks.useReportSummary).mockReturnValue(queryResult(report));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      filenames.push(this.download);
    });
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
    expect(filenames).toEqual(["departments-2026-09-26.csv"]);
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

  it("exports borrowing counts with escaped equipment names, nullable values and the Bangkok report date", async () => {
    vi.mocked(reportHooks.useReportSummary).mockReturnValue(
      queryResult(
        reportSummaryOutput.strict().parse({
          ...report,
          generatedAt: "2031-09-25T18:00:00.000Z",
          unscoped: true,
          topEquipment: [
            { itemKey: 11, name: 'มิเตอร์, "A"\nรุ่นใหม่', tier: "T2", count: 15 },
            { itemKey: 12, name: null, tier: null, count: 0 },
          ],
        })
      )
    );
    render(<ReportExportPage />);
    expect(screen.getByText(i18n.t("reports.export.scopeAll"))).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: i18n.t("reports.export.download") })[1]
    );
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(await blobText(blob)).toBe(
      '"equipment","tier","times_borrowed"\n"มิเตอร์, ""A""\nรุ่นใหม่","T2","15"\n"#12","","0"'
    );
    expect(filenames).toEqual(["top-equipment-2031-09-26.csv"]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("does not offer downloads while the report is loading", () => {
    vi.mocked(reportHooks.useReportSummary).mockReturnValue(loadingQueryResult());
    render(<ReportExportPage />);
    expect(screen.getByText(i18n.t("common.loading"))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("reports.export.download") })
    ).not.toBeInTheDocument();
  });

  it("shows a failed report without downloading a stale file", () => {
    vi.mocked(reportHooks.useReportSummary).mockReturnValue(
      errorQueryResult(new Error("Report unavailable"))
    );
    render(<ReportExportPage />);
    expect(screen.getByText(i18n.t("reports.export.failed"))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("reports.export.download") })
    ).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
