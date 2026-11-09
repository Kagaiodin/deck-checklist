// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../needs-visual-checks.sh", import.meta.url));
const root = fileURLToPath(new URL("../..", import.meta.url));

/** Runs the script in stdin mode with one changed path per line; returns its stdout. */
const check = (files: string[], env: Record<string, string> = {}) =>
  execFileSync("sh", [script, "-"], {
    input: files.join("\n"),
    stdio: ["pipe", "pipe", "ignore"],
    env: { ...process.env, VISUAL_CHECKS_FORCE: "", ...env },
  })
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

  it("runs a docs-only change when VISUAL_CHECKS_FORCE=true (push to main, run-visual label)", () => {
    expect(check(["README.md"], { VISUAL_CHECKS_FORCE: "true" })).toBe("true");
  });

  it("runs when the base ref doesn't exist (fails open)", () => {
    const out = execFileSync("sh", [script, "no-such-ref-xyz"], { stdio: ["ignore", "pipe", "ignore"] });
    expect(out.toString().trim()).toBe("true");
  });
});

/**
 * Guards the skip list from the other side: a skipped path is only safe while nothing the contrast and a11y gates
 * render or run reads it. Scans the app (non-test `src/`, `index.html`) and the gate scripts for quoted path-like
 * strings (imports, `?raw`, `new URL(...)`, file reads) and asks the script itself whether each one is skippable.
 */
describe("needs-visual-checks.sh skip list", () => {
  const isTestPath = (p: string) => p.includes("__tests__/") || p.startsWith("src/test/");
  const scanned = [
    "index.html",
    ...readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
      .map((f) => `src/${f.split("\\").join("/")}`)
      .filter((f) => /\.(tsx?|css)$/.test(f) && !isTestPath(f)),
    ...readdirSync(join(root, "scripts"))
      .filter((f) => /\.(ts|sh)$/.test(f) && f !== "needs-visual-checks.sh")
      .map((f) => `scripts/${f}`),
  ];

  /** Repo-relative paths a file refers to: quoted strings with a `/` and no spaces or shell/template syntax. */
  const referencedPaths = (file: string) =>
    [...readFileSync(join(root, file), "utf8").matchAll(/['"]([^'"\s$`{}]*\/[^'"\s$`{}]*)['"]/g)]
      .map(([, ref]) => ref.split("?")[0])
      .filter((ref) => ref && !/^[a-z]+:/i.test(ref) && !ref.startsWith("//"))
      .map((ref) => (ref.startsWith(".") ? relative(root, normalize(join(root, dirname(file), ref))) : ref.replace(/^\//, "")))
      .map((ref) => ref.split("\\").join("/"));

  it("nothing the visual gates use reads a skipped path (if it must, take that path off the skip list)", () => {
    const refs = new Map<string, string>();
    for (const file of scanned) for (const ref of referencedPaths(file)) if (!refs.has(ref)) refs.set(ref, file);
    const skipped = [...refs].filter(([ref]) => check([ref]) === "false").map(([ref, file]) => `${file} -> ${ref}`);
    expect(skipped).toEqual([]);
  });

  it("the scan reaches the app and the gate scripts", () => {
    expect(scanned).toContain("src/App.tsx");
    expect(scanned).toContain("scripts/capture-screenshots.ts");
    expect(scanned.some(isTestPath)).toBe(false);
  });
});
