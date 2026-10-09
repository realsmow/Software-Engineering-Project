import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { UnitSchedule } from "../../src/features/borrower/catalog/unit-schedule";
import { queryResult } from "../fixtures/query-results";

const useUnitSchedule = vi.hoisted(() => vi.fn());
vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({ useUnitSchedule }));

// Demo feedback: per-unit timeslots so borrowers can book the free units.
describe("UnitSchedule", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-09-29T02:00:00.000Z")); // Monday 09:00 Bangkok
  });
  afterEach(() => vi.useRealTimers());

  it("marks booked days per unit and weekends as closed", () => {
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
    render(<UnitSchedule itemId="5" />);
    const cell = (serial: string, iso: string) =>
      screen.getByLabelText(new RegExp(`^${serial} ${iso}:`)).getAttribute("aria-label");
    expect(cell("OSC-001", "2031-09-29")).toMatch(/Free$/);
    expect(cell("OSC-001", "2031-09-30")).toMatch(/Booked or on loan$/);
    expect(cell("OSC-001", "2031-10-01")).toMatch(/Booked or on loan$/);
    expect(cell("OSC-001", "2031-10-02")).toMatch(/Free$/);
    expect(cell("OSC-002", "2031-09-30")).toMatch(/Free$/);
    expect(cell("OSC-002", "2031-10-04")).toMatch(/Counter closed$/);
  });
});
