import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GoogleDriveBackup } from "../GoogleDriveBackup";
import { disconnect } from "../../../utils/googleDrive";
import type { Deck } from "../../../types/index";

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
  decks: [] as Deck[],
  allErrors: {},
  collection: {},
  collectionMeta: null,
  orders: [],
  vendorHistory: [],
  onImport: vi.fn().mockReturnValue({ newDecks: 0, newCards: 0, newOrders: 0 }),
  showToast: vi.fn(),
  variant: "sidebar" as const,
};

describe("GoogleDriveBackup", () => {
  beforeEach(() => {
    mockScriptLoad();
    mockTokenClient();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ email: "kagaiodin@gmail.com" })));
  });

  afterEach(() => {
    disconnect();
    delete (window as { google?: unknown }).google;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    const onImport = vi.fn().mockReturnValue({ newDecks: 1, newCards: 0, newOrders: 0 });
    const showToast = vi.fn();
    const backup = { version: 1, exportedAt: "2026-07-01T00:00:00Z", decks: [], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(backup) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleDriveBackup {...baseProps} onImport={onImport} showToast={showToast} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(backup, true));
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Loaded from Drive" }));
  });

  it("shows the conflict modal when local data exists, and resolves via Keep Drive version", async () => {
    const onImport = vi.fn().mockReturnValue({ newDecks: 1, newCards: 0, newOrders: 0 });
    const showToast = vi.fn();
    const backup = { version: 1, exportedAt: "2026-07-01T00:00:00Z", decks: [deck], errors: {}, collection: {}, collectionMeta: null, orders: [], vendorHistory: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: "kagaiodin@gmail.com" }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(backup) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleDriveBackup {...baseProps} decks={[deck]} onImport={onImport} showToast={showToast} />);
    fireEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    await screen.findByText("kagaiodin@gmail.com");

    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await screen.findByText("Keep which version?");

    fireEvent.click(screen.getByText("Keep Drive version"));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(backup, true));
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "Loaded Drive version" }));
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
