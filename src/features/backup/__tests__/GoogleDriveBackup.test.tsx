import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GoogleDriveBackup } from "../GoogleDriveBackup";
import { disconnect } from "../../../utils/googleDrive";
import type { Deck } from "../../../types/index";
import { installMemoryLocalStorage, restoreLocalStorage, type MemoryStorage } from "../../demo/__tests__/memoryStorage";
import { page } from "../../../utils/page";

function mockTokenClient(overrides: Partial<GoogleTokenResponse> = {}) {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn(config => ({
          requestAccessToken: () => {
            if (overrides.error) {
              config.callback({ access_token: "", expires_in: 0, scope: "", token_type: "", ...overrides });
            } else {
              config.callback({ access_token: "tok-1", expires_in: 3600, scope: "", token_type: "Bearer", ...overrides });
            }
          },
        })),
        revoke: vi.fn(),
      },
    },
  };
}

function mockScriptLoad() {
  const origCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreateElement(tag);
    if (tag === "script") setTimeout(() => el.onload?.(new Event("load")), 0);
    return el;
  });
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}

const deck: Deck = {
  id: "d1", name: "Krenko, Mob Boss", cards: [
    { id: "c1", name: "Goblin Bombardment", quantity: 1, acquired: false },
  ],
} as unknown as Deck;

const baseProps = {
  showToast: vi.fn(),
  variant: "sidebar" as const,
};

describe("GoogleDriveBackup", () => {
  let storage: MemoryStorage;
  let reload: Mock<() => void>;
  beforeEach(() => {
    storage = installMemoryLocalStorage();
    reload = vi.fn<() => void>();
    vi.spyOn(page, "reload").mockImplementation(reload);
    mockScriptLoad();
    mockTokenClient();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ email: "kagaiodin@gmail.com" })));
  });

  afterEach(() => {
    disconnect();
    delete (window as { google?: unknown }).google;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreLocalStorage();
    sessionStorage.clear();
  });

  it("shows the connect button when not connected", () => {
    render(<GoogleDriveBackup {...baseProps} />);
    expect(screen.getByRole("button", { name: /connect google drive/i })).toBeInTheDocument();
  });

  it("connects and shows the account, Save, and Load", async () => {
    render(<GoogleDriveBackup {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));

    await screen.findByText("kagaiodin@gmail.com");
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load/i })).toBeInTheDocument();
  });

  it("disconnects back to the connect button and toasts", async () => {
    const showToast = vi.fn();
    render(<GoogleDriveBackup {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByLabelText("Disconnect Google Drive"));
    expect(screen.getByRole("button", { name: /connect google drive/i })).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Disconnected from Drive" }));
  });

  it("saves to Drive and shows a success toast", async () => {
    const showToast = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" })) // connect profile
      .mockResolvedValueOnce(jsonResponse({ files: [] })) // search
      .mockResolvedValueOnce(jsonResponse({ id: "file-1" })); // create
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleDriveBackup {...baseProps} showToast={showToast} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved to Drive" })));
  });

  it("loads directly when there's no local data to conflict with", async () => {
    const backup = { version: 1, exportedAt: "2026-07-01T00:00:00Z", decks: [deck], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(backup) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    // Working state alone isn't data a Drive load would cost the user.
    storage.setItem("mtg-checklist-vendor-history", JSON.stringify(["TCGplayer"]));
    render(<GoogleDriveBackup {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(JSON.parse(storage.getItem("mtg-checklist-decks")!)).toEqual([deck]);
    expect(JSON.parse(storage.getItem("mtg-checklist-vendor-history")!)).toEqual([]);
    expect(JSON.parse(sessionStorage.getItem("fetchlist:backup:flash")!)).toEqual([expect.objectContaining({ title: "Loaded from Drive" })]);
  });

  it("shows the conflict modal when local data exists, and resolves via Keep Drive version", async () => {
    const backup = { version: 1, exportedAt: "2026-07-01T00:00:00Z", decks: [deck], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(backup) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    // Deck errors count as data on this device (the old check missed them).
    storage.setItem("mtg-checklist-errors", JSON.stringify({ d9: [{ line: "x" }] }));
    render(<GoogleDriveBackup {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await screen.findByText("Keep which version?");

    fireEvent.click(screen.getByText("Keep Drive version"));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(JSON.parse(storage.getItem("mtg-checklist-decks")!)).toEqual([deck]);
    expect(JSON.parse(storage.getItem("mtg-checklist-errors")!)).toEqual({});
    expect(JSON.parse(sessionStorage.getItem("fetchlist:backup:flash")!)).toEqual([expect.objectContaining({ title: "Loaded Drive version" })]);
  });

  it("rejects an unreadable Drive file before asking which version to keep", async () => {
    storage.setItem("mtg-checklist-decks", JSON.stringify([deck]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "{not json" } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleDriveBackup {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await screen.findByText("The Drive backup couldn't be read.");
    expect(screen.queryByText("Keep which version?")).not.toBeInTheDocument();
    expect(JSON.parse(storage.getItem("mtg-checklist-decks")!)).toEqual([deck]);
  });

  it("rejects a Drive file that isn't a backup without touching local data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify({ hello: "world" }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleDriveBackup {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await screen.findByText("The Drive backup couldn't be read.");
    expect(reload).not.toHaveBeenCalled();
    expect(storage.getItem("mtg-checklist-decks")).toBeNull();
  });

  it("shows a reconnect notice when a save fails with an expired token", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({}, false, 401));
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleDriveBackup {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await screen.findByText("Drive session expired");
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
  });
});

describe("GoogleDriveBackup — demo mode", () => {
  beforeEach(() => {
    mockScriptLoad();
    mockTokenClient();
  });
  afterEach(() => {
    delete (window as { google?: unknown }).google;
    vi.restoreAllMocks();
    restoreLocalStorage();
  });

  it("shows a disabled connect button instead of Drive actions", () => {
    installMemoryLocalStorage().setItem("fetchlist:demo:active", "true");
    render(<GoogleDriveBackup {...baseProps} />);
    const btn = screen.getByRole("button", { name: /connect google drive/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Exit demo mode to back up your data");
  });
});

