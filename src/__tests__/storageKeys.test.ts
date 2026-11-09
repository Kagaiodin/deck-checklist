import { describe, it, expect } from "vitest";
import ts from "typescript";
import { STORAGE_KEYS } from "../store/storageKeys";

// Static scan of every localStorage key in src/. Guards two rules:
// 1. One module writes each key, through at most one useLocalStorage copy. Two copies of one key
//    never sync, so the second saves stale data over the first (the order-receive bug, #189),
//    even when both sit in one module (App.tsx's two decks copies, #204).
// 2. Every key is registered in src/store/storageKeys.ts with its kind, which decides whether
//    demo mode swaps it, so new persisted data cannot leak between demo and real data unnoticed.
// Keys must be string literals or string constants so this scan can resolve them, passed straight to
// localStorage, useLocalStorage, or loadJson / saveJson (store/savedJson.ts).

/** Keys written from more than one module on purpose. Each entry needs a reason and a way out. */
const SHARED_WRITERS: Record<string, string> = {};

// demo/ swaps every managed key by design (its own demo:* keys are its bookkeeping, not app data); so does
// backup.ts, which writes every backed-up key on import and then reloads, keeping no copy in memory.
// useLocalStorage.ts and store/savedJson.ts are the generic hook and helpers themselves.
const SKIP = [/__tests__\//, /^test\//, /\.test\.tsx?$/, /^features\/demo\//, /^features\/backup\/backup\.ts$/, /^hooks\/useLocalStorage\.ts$/, /^store\/savedJson\.ts$/];

// Calls that take a key as their first argument: true for a write, false for a read.
const KEYED_CALLS: Record<string, boolean> = { useLocalStorage: true, saveJson: true, loadJson: false };

type Usage = { writers: Set<string>; readers: Set<string>; hookCopies: string[] };

// Raw source of every file under src/, keyed "../<path>" relative to this folder.
const SOURCES = import.meta.glob<string>(["../**/*.ts", "../**/*.tsx", "!../**/*.d.ts"], { query: "?raw", import: "default", eager: true });

function scan() {
  const files = Object.entries(SOURCES).map(([path, text]) => {
    const rel = path.replace(/^\.\.\//, "");
    return { rel, sf: ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true) };
  });

  // String constants per file, and exported ones by name (for imported key constants).
  const localConsts = new Map<string, Map<string, string>>();
  const exportedConsts = new Map<string, Set<string>>();
  for (const { rel, sf } of files) {
    const consts = new Map<string, string>();
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      const exported = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteralLike(d.initializer)) {
          consts.set(d.name.text, d.initializer.text);
          if (exported) exportedConsts.set(d.name.text, (exportedConsts.get(d.name.text) ?? new Set()).add(d.initializer.text));
        }
      }
    }
    localConsts.set(rel, consts);
  }

  const usage = new Map<string, Usage>();
  const unresolved: string[] = [];
  const record = (key: string, file: string, write: boolean, hookCallSite?: string) => {
    const u = usage.get(key) ?? { writers: new Set(), readers: new Set(), hookCopies: [] };
    (write ? u.writers : u.readers).add(file);
    if (hookCallSite) u.hookCopies.push(hookCallSite);
    usage.set(key, u);
  };

  for (const { rel, sf } of files) {
    if (SKIP.some(re => re.test(rel))) continue;
    const resolve = (arg: ts.Expression | undefined): string | undefined => {
      if (!arg) return undefined;
      if (ts.isStringLiteralLike(arg)) return arg.text;
      if (ts.isIdentifier(arg)) {
        const local = localConsts.get(rel)?.get(arg.text);
        if (local !== undefined) return local;
        const exported = exportedConsts.get(arg.text);
        if (exported?.size === 1) return [...exported][0];
      }
      return undefined;
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        let write: boolean | undefined;
        const isHookCall = ts.isIdentifier(callee) && callee.text === "useLocalStorage";
        if (ts.isIdentifier(callee) && callee.text in KEYED_CALLS) write = KEYED_CALLS[callee.text];
        else if (ts.isPropertyAccessExpression(callee) && /(^|\.)localStorage$/.test(callee.expression.getText(sf))) {
          const method = callee.name.text;
          if (method === "getItem") write = false;
          else if (method === "setItem" || method === "removeItem") write = true;
        }
        if (write !== undefined) {
          const key = resolve(node.arguments[0]);
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          if (key === undefined) unresolved.push(`${rel}:${line + 1}`);
          else record(key, rel, write, isHookCall ? `${rel}:${line + 1}` : undefined);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { usage, unresolved };
}

const { usage, unresolved } = scan();
const registered = new Set<string>(STORAGE_KEYS.map(e => e.key));

describe("localStorage keys", () => {
  it("finds the app's keys (the scan is not silently empty)", () => {
    expect(usage.size).toBeGreaterThanOrEqual(10);
  });

  it("every key resolves to a literal or string constant", () => {
    expect(unresolved, "Pass the key as a literal or a string constant. A generic wrapper like `k => localStorage.getItem(k)` hides the key from this scan; give each key its own call.").toEqual([]);
  });

  it("each key has one writing module, apart from the listed exceptions", () => {
    const shared = [...usage].filter(([, u]) => u.writers.size > 1).map(([k, u]) => `${k}: ${[...u.writers].sort().join(", ")}`);
    expect(
      shared.filter(s => !(s.split(":")[0] in SHARED_WRITERS)),
      "Two modules write this key, and their copies never sync (#189). Move every write into one module, or list the key in SHARED_WRITERS with a reason and a way out.",
    ).toEqual([]);
  });

  it("each key has at most one useLocalStorage copy", () => {
    const copies = [...usage].filter(([, u]) => u.hookCopies.length > 1).map(([k, u]) => `${k}: ${u.hookCopies.join(", ")}`);
    expect(
      copies,
      "Each useLocalStorage call holds its own copy of the key, and the copies never sync (#189, #204). Keep one copy and pass its value or setter down, or move the state into one owner (see CODING_STANDARDS.md).",
    ).toEqual([]);
  });

  it("SHARED_WRITERS has no stale entries (remove a key once one module owns it)", () => {
    const stale = Object.keys(SHARED_WRITERS).filter(k => (usage.get(k)?.writers.size ?? 0) <= 1);
    expect(stale, "Only one module writes this key now. Remove its SHARED_WRITERS entry in the same commit that removed the second writer.").toEqual([]);
  });

  it("every key is registered", () => {
    const unregistered = [...usage.keys()].filter(k => !registered.has(k));
    expect(
      unregistered,
      "Declare the key in src/store/storageKeys.ts: export a constant, use it at the call site, and add a STORAGE_KEYS entry with its kind (User data, Working state or Preference; see GLOSSARY.md) and its backup field.",
    ).toEqual([]);
  });

  it("STORAGE_KEYS only lists keys the app uses", () => {
    const unused = [...registered].filter(k => !usage.has(k));
    expect(
      unused,
      "No module reads or writes this key as `localStorage.getItem/setItem/removeItem(KEY)`, `useLocalStorage(KEY)` or `loadJson/saveJson(KEY)`, so the scan thinks the app doesn't use it. If you moved the calls behind an injected storage parameter (`storage.getItem(KEY)`), the scan can't see them: call `loadJson`/`saveJson` or `window.localStorage` with the key constant directly, for example in an adapter with one method per key. Otherwise drop the stale STORAGE_KEYS entry.",
    ).toEqual([]);
  });
});
