import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import { DateInput } from "../../src/components/ui/date-input";

// Demo feedback: one date format everywhere, not the browser's 10/09/2026.
describe("DateInput", () => {
  beforeEach(() => void i18n.changeLanguage("en"));

  it("shows the app date format and picks a day from the month grid", () => {
    const onChange = vi.fn();
    render(
      <DateInput value="2026-10-09" min="2026-10-08" onChange={onChange} ariaLabel="Pickup date" />
    );
    const trigger = screen.getByRole("button", { name: /Pickup date: 9 Oct 2026/ });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "7 Oct 2026" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "9 Oct 2026" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "12 Oct 2026" }));
    expect(onChange).toHaveBeenCalledWith("2026-10-12");
  });
});
