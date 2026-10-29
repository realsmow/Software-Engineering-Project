import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { AvailabilityCalendar } from "../../src/features/borrower/request/availability-calendar";

const useCartSchedule = vi.hoisted(() => vi.fn());
vi.mock("../../src/features/borrower/catalog/use-equipment-types", () => ({ useCartSchedule }));

// Demo feedback: the request page shows when the cart's items can be borrowed.
describe("AvailabilityCalendar", () => {
  beforeEach(() => {
    void i18n.changeLanguage("en");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2031-09-22T02:00:00.000Z")); // Monday 09:00 Bangkok
    useCartSchedule.mockReturnValue([
      {
        data: [
          // Unit 1 is out Tuesday; unit 2 Tuesday and Wednesday (Bangkok days).
          { resourceKey: 1, serialNo: "A", unavailable: false, busy: [{ start: "2031-09-23T02:00:00.000Z", end: "2031-09-23T09:00:00.000Z" }] },
          { resourceKey: 2, serialNo: "B", unavailable: false, busy: [{ start: "2031-09-23T02:00:00.000Z", end: "2031-09-24T09:00:00.000Z" }] },
        ],
      },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  function day(label: string) {
    return screen.getByRole("button", { name: new RegExp(`^${label}:`) });
  }

  it("colors each day by how many units are free for the requested quantity", () => {
    render(
      <AvailabilityCalendar
        lines={[{ itemId: "5", name: "Scope", qty: 2 }]}
        startDate="2031-09-22"
        endDate={null}
        maxDate="2031-12-28"
        onPickup={vi.fn()}
        onReturn={vi.fn()}
      />
    );
    expect(day("22 Sept 2031").getAttribute("aria-label")).toContain("All free");
    expect(day("23 Sept 2031").getAttribute("aria-label")).toContain("Fully booked");
    expect(day("24 Sept 2031").getAttribute("aria-label")).toContain("Not enough for your quantity");
    expect(day("27 Sept 2031").getAttribute("aria-label")).toContain("Counter closed");
  });

  it("takes a pickup click then a return click, and refuses a weekend pickup", () => {
    const onPickup = vi.fn();
    const onReturn = vi.fn();
    const props = {
      lines: [{ itemId: "5", name: "Scope", qty: 1 }],
      maxDate: "2031-12-28",
      onPickup,
      onReturn,
    };
    // A full range on screen: the next tap starts a new pickup.
    const { rerender } = render(
      <AvailabilityCalendar {...props} startDate="2031-09-22" endDate="2031-09-22" />
    );
    fireEvent.click(day("27 Sept 2031"));
    expect(onPickup).not.toHaveBeenCalled();
    fireEvent.click(day("25 Sept 2031"));
    expect(onPickup).toHaveBeenCalledWith("2031-09-25");
    // The page then clears the return day, so the next tap sets it.
    rerender(<AvailabilityCalendar {...props} startDate="2031-09-25" endDate={null} />);
    expect(screen.getByText(i18n.t("borrower.request.calPickReturn"))).toBeInTheDocument();
    fireEvent.click(day("26 Sept 2031"));
    expect(onReturn).toHaveBeenCalledWith("2031-09-26");
  });

  it("#234: shows a holiday the admin listed as closed and refuses it as a pickup day", () => {
    const onPickup = vi.fn();
    render(
      <AvailabilityCalendar
        lines={[{ itemId: "5", name: "Scope", qty: 1 }]}
        startDate="2031-09-22"
        endDate="2031-09-22"
        maxDate="2031-12-28"
        holidays={new Set(["2031-09-25"])}
        onPickup={onPickup}
        onReturn={vi.fn()}
      />
    );
    expect(day("25 Sept 2031").getAttribute("aria-label")).toContain("Counter closed");
    fireEvent.click(day("25 Sept 2031"));
    expect(onPickup).not.toHaveBeenCalled();
    expect(day("26 Sept 2031").getAttribute("aria-label")).not.toContain("Counter closed");
  });
});
