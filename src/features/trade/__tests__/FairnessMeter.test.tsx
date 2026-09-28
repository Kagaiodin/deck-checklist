import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FairnessMeter } from "../components/FairnessMeter";
import { fairness } from "../../../utils/tradePricing";

const meter = (mine: number, theirs: number, over: Partial<React.ComponentProps<typeof FairnessMeter>> = {}) => (
  <FairnessMeter fairness={fairness(mine, theirs, 10)} isNeutral={false} tolerancePct={10} {...over} />
);

const track = () => screen.getByRole("meter", { name: "Trade fairness" });
const root = (c: HTMLElement) => c.querySelector<HTMLElement>(".tr-meter")!;

describe("FairnessMeter", () => {
  it("shows a neutral prompt instead of a verdict until both sides are populated", () => {
    const { container } = render(meter(50, 0, { isNeutral: true, neutralText: "Add cards to Their offer" }));
    expect(root(container).dataset.band).toBe("empty");
    expect(screen.getByText("Add cards")).toBeInTheDocument();
    expect(screen.getByText("Add cards to Their offer")).toBeInTheDocument();
    expect(track()).toHaveAttribute("aria-valuetext", "No comparison yet — add cards to both sides.");
    expect(screen.queryByText(/to even it out/)).not.toBeInTheDocument();
  });

  it("reads Fair within tolerance and offers no balancing hint", () => {
    const { container } = render(meter(100, 95));
    expect(root(container).dataset.band).toBe("fair");
    expect(screen.getByText("Fair")).toBeInTheDocument();
    expect(screen.queryByText(/to even it out/)).not.toBeInTheDocument();
  });

  it("reads Leaning between tolerance and the leaning cutoff", () => {
    const { container } = render(meter(100, 80)); // 20%
    expect(root(container).dataset.band).toBe("leaning");
    expect(screen.getByText("Leaning")).toBeInTheDocument();
  });

  it("reads Lopsided past the cutoff", () => {
    const { container } = render(meter(100, 40)); // 60%
    expect(root(container).dataset.band).toBe("lopsided");
    expect(screen.getByText("Lopsided")).toBeInTheDocument();
  });

  it("says the receiving side is favored: I give more → favors them", () => {
    render(meter(100, 60));
    expect(screen.getByText("them")).toBeInTheDocument();
    expect(screen.getByText(/You give/)).toBeInTheDocument();
    expect(screen.getByText(/Add/).textContent).toContain("Their side");
  });

  it("I get more → favors you, and the hint points at My side", () => {
    render(meter(60, 100));
    expect(screen.getByText("you")).toBeInTheDocument();
    expect(screen.getByText(/They give/)).toBeInTheDocument();
    expect(screen.getByText(/Add/).textContent).toContain("My side");
  });

  it("calls onAddBalance with the lower side and the dollar gap", async () => {
    const onAdd = vi.fn();
    render(meter(100, 60, { onAddBalance: onAdd }));
    await userEvent.click(screen.getByRole("button", { name: /Add cash line/ }));
    expect(onAdd).toHaveBeenCalledWith("theirs", 40);
  });

  it("hides the add-cash action when no handler is given (read-only)", () => {
    render(meter(100, 60));
    expect(screen.getByText(/to even it out/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add cash line/ })).not.toBeInTheDocument();
  });

  it("is dead even at equal totals", () => {
    const { container } = render(meter(50, 50));
    expect(screen.getByText("Dead even")).toBeInTheDocument();
    expect(track()).toHaveAttribute("aria-valuenow", "50");
    expect(root(container).style.getPropertyValue("--share")).toBe("50.00%");
  });

  it("places the marker by My share and clamps it off the track ends", () => {
    const { container, rerender } = render(meter(75, 25));
    expect(track()).toHaveAttribute("aria-valuenow", "75");
    expect(root(container).style.getPropertyValue("--share")).toBe("75.00%");
    rerender(meter(1000, 1)); // ~99.9% → clamped
    expect(root(container).style.getPropertyValue("--share")).toBe("97.00%");
    rerender(meter(1, 1000));
    expect(root(container).style.getPropertyValue("--share")).toBe("3.00%");
  });

  it("widens the Fair zone with tolerance", () => {
    const { container, rerender } = render(meter(100, 100));
    const zone = () => container.querySelector<HTMLElement>(".tr-meter-zone--fair")!;
    const narrow = parseFloat(zone().style.left);
    rerender(<FairnessMeter fairness={fairness(100, 100, 30)} isNeutral={false} tolerancePct={30} />);
    expect(parseFloat(zone().style.left)).toBeLessThan(narrow);
  });

  it("compact mode drops the side labels, delta and hint", () => {
    render(meter(100, 40, { compact: true }));
    expect(screen.queryByText("My offer")).not.toBeInTheDocument();
    expect(screen.queryByText(/to even it out/)).not.toBeInTheDocument();
    expect(screen.getByText("Lopsided")).toBeInTheDocument();
  });

  it("announces the verdict in a live region", () => {
    render(meter(100, 60));
    expect(screen.getByRole("status")).toHaveTextContent(/Leaning|Lopsided/);
    expect(screen.getByRole("status")).toHaveTextContent("Favors them");
  });
});
