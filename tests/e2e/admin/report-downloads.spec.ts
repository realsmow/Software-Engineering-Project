import { readFile } from "node:fs/promises";
import { expect, test } from "../fixtures/api-contracts";
import { liveCall, visitAs } from "../fixtures/live-workflow";
import { reportSummaryOutput } from "../../../backend/src/report/report.schema";

for (const role of ["staff", "admin"] as const) {
  test(`FR-ADM-06: ${role} downloads department and equipment CSVs matching their real report`, async ({
    page,
  }) => {
    await visitAs(page, role, "/reports/export");
    await expect(page.getByRole("heading", { name: "Export data" })).toBeVisible();
    const report = await liveCall(page.request, "report.summary", reportSummaryOutput, {
      topLimit: 50,
    });
    expect(report.unscoped).toBe(role === "admin");
    expect(report.departments.length).toBeGreaterThan(0);
    expect(report.topEquipment.length).toBeGreaterThan(0);
    const files = [
      {
        prefix: "departments",
        rows: [
          [
            "department",
            "loans",
            "overdue",
            "units_held",
            "units_out",
            "utilization_percent",
          ],
          ...report.departments.map((row) => [
            row.name ?? `#${row.manageGroupKey}`,
            row.loans,
            row.overdue,
            row.unitsHeld,
            row.unitsOut,
            row.utilization,
          ]),
        ],
      },
      {
        prefix: "top-equipment",
        rows: [
          ["equipment", "tier", "times_borrowed"],
          ...report.topEquipment.map((row) => [
            row.name ?? `#${row.itemKey}`,
            row.tier ?? "",
            row.count,
          ]),
        ],
      },
    ];
    for (const [index, file] of files.entries()) {
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download CSV", exact: true })
        .nth(index)
        .click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe(`${file.prefix}-2031-09-26.csv`);
      const path = await download.path();
      expect(path).not.toBeNull();
      const bytes = await readFile(path!);
      expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      const expected =
        "\uFEFF" +
        file.rows
          .map((row) =>
            row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")
          )
          .join("\n");
      expect(bytes.toString("utf8")).toBe(expected);
      expect(await download.failure()).toBeNull();
    }
  });
}
