import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { UnitSchedule } from "../../src/features/staff/queue/unit-schedule";
import { queryResult } from "../fixtures/query-results";

const useUnitSchedule = vi.hoisted(() => vi.fn());
vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({ useUnitSchedule }));
const useHolidays = vi.hoisted(() => vi.fn(() => new Set<string>()));
vi.mock("../../src/lib/closed-days", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/closed-days")>()),
  useHolidays,
}));

// #235 (instructor item 7, team decision D-04): staff preparing a request see
// which unit is busy on which day, so they can choose a unit whose next
// booking is not right behind this one. Restored from the borrower page.
describe("UnitSchedule for staff", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-09-29T02:00:00.000Z")); // Monday 09:00 Bangkok
  });
  afterEach(() => vi.useRealTimers());

  it("marks booked days per unit, and weekends and holidays as closed", () => {
    useHolidays.mockReturnValue(new Set(["2031-10-02"])); // a Thursday
    useUnitSchedule.mockReturnValue(
      queryResult([
        {
          resourceKey: 1,
          serialNo: "OSC-001",
          unavailable: false,
          // Tue 08:00 to Wed 16:00 Bangkok.
          busy: [{ start: "2031-09-30T01:00:00.000Z", end: "2031-10-01T09:00:00.000Z" }],
        },
        { resourceKey: 2, serialNo: "OSC-002", unavailable: false, busy: [] },
      ])
    );
    render(<UnitSchedule itemKey={5} />);

    expect(useUnitSchedule).toHaveBeenCalledWith("5", expect.any(String), 14);
    const cell = (serial: string, iso: string) =>
      screen.getByLabelText(new RegExp(`^${serial} ${iso}:`)).getAttribute("aria-label");
    expect(cell("OSC-001", "2031-09-29")).toMatch(/Free$/);
    expect(cell("OSC-001", "2031-09-30")).toMatch(/Booked or on loan$/);
    expect(cell("OSC-001", "2031-10-01")).toMatch(/Booked or on loan$/);
    expect(cell("OSC-002", "2031-09-30")).toMatch(/Free$/);
    expect(cell("OSC-002", "2031-10-02")).toMatch(/Counter closed$/);
    expect(cell("OSC-002", "2031-10-04")).toMatch(/Counter closed$/);
  });
});
