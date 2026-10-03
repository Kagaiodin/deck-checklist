import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionQuickAdd } from "../components/CollectionQuickAdd";

function stubAutocomplete(names: string[]) {
  const fetchMock = vi.fn(async () => ({ json: async () => ({ data: names }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CollectionQuickAdd", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("disables Add until a name is entered", async () => {
    stubAutocomplete([]);
    render(<CollectionQuickAdd onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await userEvent.setup().type(screen.getByPlaceholderText("Card name…"), "Sol Ring");
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });

  it("adds with quantity and foil, then resets for the next entry", async () => {
    stubAutocomplete([]);
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={onAdd} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("Card name…");
    await user.type(input, "  Sol Ring ");
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onAdd).toHaveBeenCalledWith("Sol Ring", 2, true);
    expect(input).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(input).toHaveClass("success-flash");
  });

  it("cannot decrease quantity below 1", () => {
    stubAutocomplete([]);
    render(<CollectionQuickAdd onAdd={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  });

  it("Enter submits when no suggestion is highlighted", async () => {
    stubAutocomplete([]);
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={onAdd} onCancel={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Card name…"), "Counterspell{Enter}");
    expect(onAdd).toHaveBeenCalledWith("Counterspell", 1, false);
  });

  it("ignores Enter on an empty name", async () => {
    stubAutocomplete([]);
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={onAdd} onCancel={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Card name…"), "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows suggestions and picks one with the mouse", async () => {
    stubAutocomplete(["Sol Ring", "Sol Talisman"]);
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("Card name…");
    await user.type(input, "sol");
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    await user.pointer({ keys: "[MouseLeft>]", target: screen.getByText("Sol Talisman") });
    expect(input).toHaveValue("Sol Talisman");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keyboard: arrows highlight, Enter selects instead of submitting", async () => {
    stubAutocomplete(["Sol Ring", "Sol Talisman"]);
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={onAdd} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("Card name…");
    await user.type(input, "sol");
    await waitFor(() => screen.getByRole("listbox"));
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(screen.getByText("Sol Ring")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(input).toHaveValue("Sol Ring");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("Escape closes suggestions first, then cancels", async () => {
    stubAutocomplete(["Sol Ring"]);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={vi.fn()} onCancel={onCancel} />);
    await user.type(screen.getByPlaceholderText("Card name…"), "sol");
    await waitFor(() => screen.getByRole("listbox"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Cancel button calls onCancel", async () => {
    stubAutocomplete([]);
    const onCancel = vi.fn();
    render(<CollectionQuickAdd onAdd={vi.fn()} onCancel={onCancel} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("warns when autocomplete fails but still allows adding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(<CollectionQuickAdd onAdd={onAdd} onCancel={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("Card name…"), "Sol Ring");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Autocomplete unavailable/));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith("Sol Ring", 1, false);
  });
});
