import { describe, it, expect, vi, afterEach } from "vitest";
import {
  supportsFileSystemAccess, getLinkedFileName, clearLinkedHandle,
  pickSaveHandle, pickOpenHandle, writeLinkedFile, readLinkedFile,
} from "../fileSystemAccess";

function makeHandle(overrides: Partial<FileSystemFileHandle> = {}): FileSystemFileHandle {
  return {
    kind: "file",
    name: "fetchlist-backup.json",
    getFile: vi.fn(),
    createWritable: vi.fn(),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    ...overrides,
  } as FileSystemFileHandle;
}

describe("fileSystemAccess", () => {
  afterEach(() => {
    // @ts-expect-error — test-only cleanup of a property we may have added
    delete window.showSaveFilePicker;
    // @ts-expect-error — test-only cleanup of a property we may have added
    delete window.showOpenFilePicker;
    clearLinkedHandle();
  });

  describe("supportsFileSystemAccess", () => {
    it("is false when the browser has no showSaveFilePicker", () => {
      expect(supportsFileSystemAccess()).toBe(false);
    });

    it("is true once showSaveFilePicker exists on window", () => {
      window.showSaveFilePicker = vi.fn();
      expect(supportsFileSystemAccess()).toBe(true);
    });
  });

  describe("pickSaveHandle / pickOpenHandle", () => {
    it("remembers the picked handle so getLinkedFileName reflects it", async () => {
      const handle = makeHandle({ name: "my-backup.json" });
      window.showSaveFilePicker = vi.fn().mockResolvedValue(handle);

      expect(getLinkedFileName()).toBeNull();
      await pickSaveHandle("my-backup.json");
      expect(getLinkedFileName()).toBe("my-backup.json");
    });

    it("remembers the handle chosen via the open picker", async () => {
      const handle = makeHandle({ name: "loaded-backup.json" });
      window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);

      await pickOpenHandle();
      expect(getLinkedFileName()).toBe("loaded-backup.json");
    });
  });

  describe("writeLinkedFile", () => {
    it("throws when no file is linked", async () => {
      await expect(writeLinkedFile("{}")).rejects.toThrow("No linked file handle");
    });

    it("writes contents through the handle and closes the stream", async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      const close = vi.fn().mockResolvedValue(undefined);
      const handle = makeHandle({ createWritable: vi.fn().mockResolvedValue({ write, close }) });
      window.showSaveFilePicker = vi.fn().mockResolvedValue(handle);
      await pickSaveHandle("backup.json");

      await writeLinkedFile('{"hello":"world"}');

      expect(write).toHaveBeenCalledWith('{"hello":"world"}');
      expect(close).toHaveBeenCalled();
    });

    it("requests permission when not already granted, and proceeds if granted", async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      const close = vi.fn().mockResolvedValue(undefined);
      const handle = makeHandle({
        queryPermission: vi.fn().mockResolvedValue("prompt"),
        requestPermission: vi.fn().mockResolvedValue("granted"),
        createWritable: vi.fn().mockResolvedValue({ write, close }),
      });
      window.showSaveFilePicker = vi.fn().mockResolvedValue(handle);
      await pickSaveHandle("backup.json");

      await writeLinkedFile("data");
      expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
      expect(write).toHaveBeenCalled();
    });

    it("rejects when permission is denied", async () => {
      const handle = makeHandle({
        queryPermission: vi.fn().mockResolvedValue("prompt"),
        requestPermission: vi.fn().mockResolvedValue("denied"),
      });
      window.showSaveFilePicker = vi.fn().mockResolvedValue(handle);
      await pickSaveHandle("backup.json");

      await expect(writeLinkedFile("data")).rejects.toThrow("Permission denied");
    });
  });

  describe("readLinkedFile", () => {
    it("throws when no file is linked", async () => {
      await expect(readLinkedFile()).rejects.toThrow("No linked file handle");
    });

    it("reads text from the linked handle", async () => {
      const handle = makeHandle({
        getFile: vi.fn().mockResolvedValue({ text: () => Promise.resolve('{"version":1}') }),
      });
      window.showOpenFilePicker = vi.fn().mockResolvedValue([handle]);
      await pickOpenHandle();

      await expect(readLinkedFile()).resolves.toBe('{"version":1}');
    });
  });
});
