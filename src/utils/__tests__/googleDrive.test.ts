import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  supportsGoogleDrive, getConnectedEmail, isConnected, isExpired,
  connect, disconnect, saveToDrive, loadFromDrive, DriveError,
} from "../googleDrive";

function mockTokenClient(overrides: Partial<GoogleTokenResponse> = {}) {
  const requestAccessToken = vi.fn();
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: vi.fn(config => {
          requestAccessToken.mockImplementation(() => {
            if (overrides.error) {
              config.callback({ access_token: "", expires_in: 0, scope: "", token_type: "", ...overrides });
            } else {
              config.callback({ access_token: "tok-1", expires_in: 3600, scope: "", token_type: "Bearer", ...overrides });
            }
          });
          return { requestAccessToken };
        }),
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

async function connectFixture() {
  mockScriptLoad();
  mockTokenClient();
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ email: "kagaiodin@gmail.com" }));
  vi.stubGlobal("fetch", fetchMock);
  await connect();
  fetchMock.mockClear();
  return fetchMock;
}

describe("googleDrive", () => {
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

  describe("supportsGoogleDrive", () => {
    it("is true once a client ID is configured (via VITE_GOOGLE_CLIENT_ID)", () => {
      expect(supportsGoogleDrive()).toBe(true);
    });
  });

  describe("connect", () => {
    it("stores the access token and connected email on success", async () => {
      expect(isConnected()).toBe(false);
      const result = await connect();
      expect(result.email).toBe("kagaiodin@gmail.com");
      expect(isConnected()).toBe(true);
      expect(getConnectedEmail()).toBe("kagaiodin@gmail.com");
    });

    it("rejects when the token client reports an error", async () => {
      mockTokenClient({ error: "access_denied", error_description: "User denied access" });
      await expect(connect()).rejects.toThrow("User denied access");
      expect(isConnected()).toBe(false);
    });
  });

  describe("isConnected / isExpired", () => {
    it("start out false, then flip once a connection lapses", async () => {
      expect(isConnected()).toBe(false);
      expect(isExpired()).toBe(false);

      await connect();
      expect(isConnected()).toBe(true);
      expect(isExpired()).toBe(false);

      vi.useFakeTimers();
      vi.advanceTimersByTime(3600 * 1000 + 1000);
      expect(isConnected()).toBe(false);
      expect(isExpired()).toBe(true);
      vi.useRealTimers();
    });
  });

  describe("disconnect", () => {
    it("revokes the token and clears connection state", async () => {
      await connect();
      disconnect();
      expect(isConnected()).toBe(false);
      expect(getConnectedEmail()).toBeNull();
      expect(window.google!.accounts.oauth2.revoke).toHaveBeenCalledWith("tok-1");
    });

    it("is a no-op when nothing is connected", () => {
      expect(() => disconnect()).not.toThrow();
    });
  });

  describe("saveToDrive / loadFromDrive — not connected", () => {
    it("throw an expired DriveError", async () => {
      await expect(saveToDrive("{}")).rejects.toMatchObject({ kind: "expired" } satisfies Partial<DriveError>);
      await expect(loadFromDrive()).rejects.toMatchObject({ kind: "expired" });
    });
  });

  describe("saveToDrive — connected", () => {
    it("creates a new appDataFolder file when none exists yet", async () => {
      const fetchMock = await connectFixture();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ files: [] })) // search
        .mockResolvedValueOnce(jsonResponse({ id: "file-1" })); // multipart create

      await saveToDrive('{"decks":[]}');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[1][0])).toContain("uploadType=multipart");
    });

    it("updates the existing file in place on the next save (no re-search)", async () => {
      const fetchMock = await connectFixture();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ files: [] }))
        .mockResolvedValueOnce(jsonResponse({ id: "file-1" }));
      await saveToDrive('{"decks":[]}');
      fetchMock.mockClear();

      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      await saveToDrive('{"decks":[1]}');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("/files/file-1");
      expect((init as RequestInit).method).toBe("PATCH");
    });

    it("classifies a 401 as an expired DriveError", async () => {
      const fetchMock = await connectFixture();
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
      await expect(saveToDrive("{}")).rejects.toMatchObject({ kind: "expired" });
    });

    it("classifies a storage-quota 403 as a quota DriveError", async () => {
      const fetchMock = await connectFixture();
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { errors: [{ reason: "storageQuotaExceeded" }] } }, false, 403)
      );
      await expect(saveToDrive("{}")).rejects.toMatchObject({ kind: "quota" });
    });

    it("classifies a network failure as an offline DriveError", async () => {
      const fetchMock = await connectFixture();
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(saveToDrive("{}")).rejects.toMatchObject({ kind: "offline" });
    });
  });

  describe("loadFromDrive — connected", () => {
    it("returns null when no backup file exists yet", async () => {
      const fetchMock = await connectFixture();
      fetchMock.mockResolvedValueOnce(jsonResponse({ files: [] }));
      await expect(loadFromDrive()).resolves.toBeNull();
    });

    it("returns the file contents and modifiedTime when found", async () => {
      const fetchMock = await connectFixture();
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ files: [{ id: "file-1", modifiedTime: "2026-07-01T00:00:00Z" }] }))
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '{"decks":[]}' } as unknown as Response);

      await expect(loadFromDrive()).resolves.toEqual({
        contents: '{"decks":[]}',
        modifiedTime: "2026-07-01T00:00:00Z",
      });
    });
  });
});
