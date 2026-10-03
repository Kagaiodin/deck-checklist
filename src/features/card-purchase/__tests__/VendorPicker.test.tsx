import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorPicker } from "../VendorPicker";
import { VENDORS } from "../useBuyFlow";

const DAY = 24 * 60 * 60 * 1000;

function setup(over: Partial<React.ComponentProps<typeof VendorPicker>> = {}) {
  const props = {
    initialVendorId: null,
    vendorLastUsed: {},
    cardCount: 3,
    onContinue: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  render(<VendorPicker {...props} />);
  return props;
}

describe("VendorPicker", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-06-15T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("pluralises the card count", () => {
    setup({ cardCount: 1 });
    expect(screen.getByText("1 card")).toBeInTheDocument();
  });

  it("shows every vendor and defaults to the first", async () => {
    const p = setup();
    expect(screen.getByText("3 cards")).toBeInTheDocument();
    for (const v of VENDORS) expect(screen.getByText(v.label)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue" }));
    expect(p.onContinue).toHaveBeenCalledWith(VENDORS[0].id);
  });

  it("starts on the initial vendor and lets the user change it", async () => {
    const last = VENDORS[VENDORS.length - 1];
    const first = VENDORS[0];
    const p = setup({ initialVendorId: last.id });
    const user = userEvent.setup();
    expect(screen.getByText(last.label).closest("button")).toHaveClass("selected");
    await user.click(screen.getByText(first.label));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(p.onContinue).toHaveBeenCalledWith(first.id);
  });

  it("Back calls onBack", async () => {
    const p = setup();
    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
    expect(p.onBack).toHaveBeenCalled();
  });

  it("formats last-used labels", () => {
    const now = Date.now();
    const [a, b, c, d, e] = VENDORS;
    setup({
      vendorLastUsed: {
        [a.id]: now - 1000,
        ...(b && { [b.id]: now - 1 * DAY }),
        ...(c && { [c.id]: now - 5 * DAY }),
        ...(d && { [d.id]: now - 30 * DAY }),
        ...(e && { [e.id]: now - 75 * DAY }),
      },
    });
    expect(screen.getByText("Last used today")).toBeInTheDocument();
    if (b) expect(screen.getByText("Last used yesterday")).toBeInTheDocument();
    if (c) expect(screen.getByText("Last used 5 days ago")).toBeInTheDocument();
    if (d) expect(screen.getByText("Last used 1 month ago")).toBeInTheDocument();
    if (e) expect(screen.getByText("Last used 2 months ago")).toBeInTheDocument();
  });

  it("says 'Never used' for vendors without history", () => {
    setup();
    expect(screen.getAllByText("Never used")).toHaveLength(VENDORS.length);
  });
});
