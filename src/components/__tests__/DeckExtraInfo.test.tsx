import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeckExtraInfo } from "../DeckExtraInfo";
import type { DeckExtraInfo as Info } from "../../types/index";

const LS_KEY = "fetchlist:extrainfo-open";

// Node's built-in localStorage can shadow jsdom's; use an in-memory mock.
function installLocalStorageMock(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
    },
    writable: true,
    configurable: true,
  });
  return store;
}

const info: Info = {
  enrichedAt: 1,
  tokens: [
    { name: "Goblin", typeLine: "Token Creature — Goblin", createdBy: ["Krenko", "Siege-Gang"] },
    { name: "Treasure", typeLine: "Token Artifact — Treasure", createdBy: [] },
    { name: "The Monarch", typeLine: "Emblem", createdBy: ["Palace Jailer"] },
    { name: "Copy", typeLine: "Token", createdBy: [] },
  ],
  altPrintings: [{ cardName: "Sol Ring", setCode: "SPM", altName: "Spidey Ring" }],
};

describe("DeckExtraInfo", () => {
  beforeEach(() => { installLocalStorageMock(); });

  it("renders nothing without data when not loading", () => {
    const { container } = render(<DeckExtraInfo extraInfo={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsed by default and shows summary badges", () => {
    render(<DeckExtraInfo extraInfo={info} />);
    expect(screen.getByRole("button", { name: /Extra Info/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("4 tokens")).toBeInTheDocument();
    expect(screen.getByText("1 alt name")).toBeInTheDocument();
    expect(screen.queryByText("Tokens needed")).not.toBeInTheDocument();
  });

  it("singularises a single token", () => {
    render(<DeckExtraInfo extraInfo={{ ...info, tokens: [info.tokens[0]], altPrintings: [] }} />);
    expect(screen.getByText("1 token")).toBeInTheDocument();
  });

  it("expands to show tokens, creators and Scryfall links, and persists open state", async () => {
    const store = installLocalStorageMock();
    render(<DeckExtraInfo extraInfo={info} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Extra Info/ }));

    expect(screen.getByText("Tokens needed")).toBeInTheDocument();
    expect(screen.getByText("Krenko")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /Search on Scryfall/ });
    expect(links).toHaveLength(2); // only tokens with creators
    expect(links[0]).toHaveAttribute("href", expect.stringContaining("type:token"));
    expect(store.get(LS_KEY)).toBe("1");
  });

  it("assigns dot classes by type line", async () => {
    const { container } = render(<DeckExtraInfo extraInfo={info} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Extra Info/ }));
    const cls = (n: string) => screen.getByText(n).querySelector(".ei-dot")!.className;
    expect(cls("Goblin")).toContain("ei-dot-creature");
    expect(cls("Treasure")).toContain("ei-dot-artifact");
    expect(cls("The Monarch")).toContain("ei-dot-emblem");
    expect(cls("Copy")).toContain("ei-dot-copy");
    void container;
  });

  it("lists alternate printings with a set-filtered Scryfall link", async () => {
    render(<DeckExtraInfo extraInfo={info} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Extra Info/ }));
    expect(screen.getByText("Alternate printings")).toBeInTheDocument();
    expect(screen.getByText("SPM · Spidey Ring")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "↗" })).toHaveAttribute("href", expect.stringContaining("set:spm"));
  });

  it("restores open state from storage", () => {
    installLocalStorageMock({ [LS_KEY]: "1" });
    render(<DeckExtraInfo extraInfo={info} />);
    expect(screen.getByText("Tokens needed")).toBeInTheDocument();
  });

  it("shows a loading message while enriching", () => {
    installLocalStorageMock({ [LS_KEY]: "1" });
    render(<DeckExtraInfo extraInfo={undefined} isLoading />);
    expect(screen.getByText("Enriching deck data…")).toBeInTheDocument();
  });

  it("shows an empty message when nothing was found", () => {
    installLocalStorageMock({ [LS_KEY]: "1" });
    render(<DeckExtraInfo extraInfo={{ tokens: [], altPrintings: [], enrichedAt: 1 }} />);
    expect(screen.getByText(/No tokens or alternate printings/)).toBeInTheDocument();
  });

  it("works when storage throws", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } },
      configurable: true, writable: true,
    });
    render(<DeckExtraInfo extraInfo={info} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Extra Info/ }));
    expect(screen.getByText("Tokens needed")).toBeInTheDocument();
  });
});
