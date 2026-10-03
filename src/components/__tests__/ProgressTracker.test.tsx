import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressTracker } from "../ProgressTracker";

describe("ProgressTracker", () => {
  it("shows the default label, counts and percentage", () => {
    const { container } = render(<ProgressTracker progress={{ total: 8, validated: 2 }} />);
    expect(screen.getByText("Validating cards…")).toBeInTheDocument();
    expect(screen.getByText("2 / 8 (25%)")).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>(".progress-bar-fill")!.style.width).toBe("25%");
  });

  it("uses a custom label", () => {
    render(<ProgressTracker progress={{ total: 1, validated: 1 }} label="Refreshing prices…" />);
    expect(screen.getByText("Refreshing prices…")).toBeInTheDocument();
    expect(screen.getByText("1 / 1 (100%)")).toBeInTheDocument();
  });

  it("avoids dividing by zero", () => {
    render(<ProgressTracker progress={{ total: 0, validated: 0 }} />);
    expect(screen.getByText("0 / 0 (0%)")).toBeInTheDocument();
  });
});
