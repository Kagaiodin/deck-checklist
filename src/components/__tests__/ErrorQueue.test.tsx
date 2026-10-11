import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorQueue } from "../ErrorQueue";
import type { ErrorQueueItem } from "../../types/index";

const errors: ErrorQueueItem[] = [
  { originalName: "Lightnin Bolt", searchName: "Lightnin Bolt", resolved: false },
  { originalName: "Sol Rng", searchName: "Sol Rng", resolved: false },
  { originalName: "Done Card", searchName: "Done Card", resolved: true },
];

function stubAutocomplete(names: string[], ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => ({ data: names }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ErrorQueue", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("renders nothing when every error is resolved", () => {
    const { container } = render(
      <ErrorQueue
        errors={[{ originalName: "x", searchName: "x", resolved: true }]}
        onRemap={vi.fn()} onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists only unresolved errors with a count", () => {
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("Cards not found (2)")).toBeInTheDocument();
    expect(screen.getByText("Lightnin Bolt")).toBeInTheDocument();
    expect(screen.queryByText("Done Card")).not.toBeInTheDocument();
  });

  it("dismisses by original name", async () => {
    const onDismiss = vi.fn();
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={onDismiss} />);
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Dismiss" })[1]);
    expect(onDismiss).toHaveBeenCalledWith("Sol Rng");
  });

  it("remaps with the edited, trimmed name", async () => {
    stubAutocomplete([]);
    const onRemap = vi.fn();
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={onRemap} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "  Lightning Bolt  ");
    await user.click(within(screen.getByRole("textbox").closest("form")!).getByRole("button", { name: "Remap" }));
    expect(onRemap).toHaveBeenCalledWith("Lightnin Bolt", "Lightning Bolt");
  });

  it("does not remap an empty value", async () => {
    stubAutocomplete([]);
    const onRemap = vi.fn();
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={onRemap} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    await user.clear(screen.getByRole("textbox"));
    await user.click(within(screen.getByRole("textbox").closest("form")!).getByRole("button", { name: "Remap" }));
    expect(onRemap).not.toHaveBeenCalled();
  });

  it("cancel leaves edit mode", async () => {
    stubAutocomplete([]);
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows autocomplete suggestions and picks one with the mouse", async () => {
    const fetchMock = stubAutocomplete(["Lightning Bolt", "Lightning Helix"]);
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    await waitFor(() => expect(screen.getByText("Lightning Helix")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("autocomplete?q=Lightnin"));

    await user.pointer({ keys: "[MouseLeft>]", target: screen.getByText("Lightning Helix") });
    expect(screen.getByRole("textbox")).toHaveValue("Lightning Helix");
    expect(screen.queryByText("Lightning Bolt")).not.toBeInTheDocument();
  });

  it("navigates suggestions with the keyboard and selects with Enter", async () => {
    stubAutocomplete(["Lightning Bolt", "Lightning Helix"]);
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    await waitFor(() => screen.getByText("Lightning Bolt"));

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(screen.getByText("Lightning Bolt")).toHaveClass("highlighted");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toHaveValue("Lightning Bolt");
  });

  it("Escape closes the suggestion list", async () => {
    stubAutocomplete(["Lightning Bolt"]);
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    await waitFor(() => screen.getByText("Lightning Bolt"));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Lightning Bolt")).not.toBeInTheDocument();
  });

  it("shows no suggestions when the request fails or the query is too short", async () => {
    const fetchMock = stubAutocomplete(["Nope"], false);
    const user = userEvent.setup();
    render(<ErrorQueue errors={errors} onRemap={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "Remap" })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("Nope")).not.toBeInTheDocument();

    fetchMock.mockClear();
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "a");
    await new Promise(r => setTimeout(r, 350));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("q=a"));
  });
});
