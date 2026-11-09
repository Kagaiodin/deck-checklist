// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../needs-visual-checks.sh", import.meta.url));

/** Runs the script in stdin mode with one changed path per line; returns its stdout. */
const check = (files: string[]) =>
  execFileSync("sh", [script, "-"], { input: files.join("\n"), stdio: ["pipe", "pipe", "ignore"] })
    .toString()
    .trim();

describe("needs-visual-checks.sh", () => {
  it.each([
    "README.md",
    "GLOSSARY.md",
    "src/features/deck/NOTES.md",
    "docs/specs/x.html",
    ".claude/hooks/block-main.sh",
    "src/store/__tests__/deckStore.test.ts",
    "scripts/__tests__/a11y-policy.test.ts",
    "src/test/renderApp.tsx",
    "vitest.config.ts",
    "eslint-suppressions.json",
    ".github/ISSUE_TEMPLATE/bug.md",
  ])("skips when the only change is %s", (file) => {
    expect(check([file])).toBe("false");
  });

  it.each([
    "src/store/deckStore.ts",
    "src/features/demo/demoData.ts",
    "src/App.css",
    "package-lock.json",
    "vite.config.ts",
    ".github/workflows/ci.yml",
    "scripts/capture-screenshots.ts",
    "test-data/decks.json",
  ])("runs when %s changes", (file) => {
    expect(check([file])).toBe("true");
  });

  it("skips when every file is skippable", () => {
    expect(check(["README.md", "docs/a.md", "src/hooks/__tests__/x.test.ts"])).toBe("false");
  });

  it("runs when one file among skippable ones is not", () => {
    expect(check(["README.md", "src/App.tsx", "docs/a.md"])).toBe("true");
  });

  it("runs on an empty file list (nothing to judge, so don't skip)", () => {
    expect(check([])).toBe("true");
  });

  it("runs when the base ref doesn't exist (fails open)", () => {
    const out = execFileSync("sh", [script, "no-such-ref-xyz"], { stdio: ["ignore", "pipe", "ignore"] });
    expect(out.toString().trim()).toBe("true");
  });
});
