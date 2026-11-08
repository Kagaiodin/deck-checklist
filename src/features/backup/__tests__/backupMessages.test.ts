import { describe, it, expect } from "vitest";
import { backupFileError, importFailure, importToasts, saveToast } from "../backupMessages";
import { consumeImportToasts, IMPORT_FLASH_KEY } from "../backup";
import { MemoryStorage } from "../../demo/__tests__/memoryStorage";

describe("import toasts", () => {
  const zero = { newDecks: 0, newCards: 0, newOrders: 0, newTrades: 0 };

  it("summarise a file import, omitting zero counts and pluralising", () => {
    expect(importToasts("file", { ...zero, newDecks: 2, newCards: 3 }, false)).toEqual([
      { title: "Import complete", sub: "2 decks · 3 collection cards added", variant: "success" },
    ]);
    expect(importToasts("file", { ...zero, newDecks: 1, newOrders: 2 }, false)[0].sub).toBe("1 deck · 2 orders added");
    expect(importToasts("file", zero, false)).toEqual([
      { title: "Nothing new to import", sub: "All items already exist locally.", variant: "neutral", autoDismiss: 3000 },
    ]);
  });

  it("name a Drive load, and warn first about a newer format", () => {
    expect(importToasts("drive", zero, false).map(t => t.title)).toEqual(["Loaded from Drive"]);
    expect(importToasts("drive-conflict", zero, true).map(t => t.title)).toEqual(["Newer backup format", "Loaded Drive version"]);
  });

  it("are shown once", () => {
    const session = new MemoryStorage();
    session.setItem(IMPORT_FLASH_KEY, JSON.stringify(importToasts("drive", zero, false)));
    expect(consumeImportToasts(session).map(t => t.title)).toEqual(["Loaded from Drive"]);
    expect(consumeImportToasts(session)).toEqual([]);
  });
});

describe("backup errors", () => {
  it("explain a rejected file and a failed write", () => {
    expect(backupFileError("bad-field")).toBe("Part of this backup is damaged, so nothing was imported.");
    expect(importFailure("storage")).toMatch(/^There isn't enough storage space/);
    expect(importFailure("demo")).toBe("Exit demo mode to back up your data");
  });
});

describe("export toast", () => {
  it("names the file it saved or downloaded, and stays quiet otherwise", () => {
    expect(saveToast({ kind: "downloaded", fileName: "b.json" })).toMatchObject({ title: "Backup exported", sub: "b.json" });
    expect(saveToast({ kind: "linked", fileName: "b.json" })).toMatchObject({ title: "Saved to file" });
    expect(saveToast({ kind: "cancelled" })).toBeNull();
    expect(saveToast({ kind: "demo" })).toBeNull();
  });
});
