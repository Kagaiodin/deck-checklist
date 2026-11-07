import { describe, it, expect } from "vitest";
import ts from "typescript";
import { MANAGED_KEYS } from "../features/demo/demoMode";

// Static scan of every localStorage key in src/. Guards two rules:
// 1. One module writes each key. Two useLocalStorage copies of one key never sync, so the
//    second writer saves stale data over the first (the order-receive bug, #189).
// 2. Every key is either swapped by demo mode (MANAGED_KEYS) or deliberately exempt below,
//    so new persisted data cannot leak between demo and real data unnoticed.
// Keys must be string literals or string constants so this scan can resolve them.

/** Keys written from more than one module on purpose. Each entry needs a reason and a way out. */
const SHARED_WRITERS: Record<string, string> = {
  "mtg-checklist-collection-v2": "App and CollectionPage both hold a copy until the Collection store lands (architecture candidate 1)",
  "mtg-checklist-collection-meta-v2": "same as the Collection key",
};

/** Keys that demo mode leaves alone: UI preferences that are not the user's data. */
const DEMO_EXEMPT: Record<string, string> = {
  "fl-theme-mode": "UI preference",
  "fl-theme-accent": "UI preference",
  "fl-sidebar-collapsed": "UI preference",
  "fetchlist:extrainfo-open": "UI preference",
};

// demo/ swaps every managed key by design; useLocalStorage.ts is the generic hook itself.
const SKIP = [/__tests__\//, /^test\//, /\.test\.tsx?$/, /^features\/demo\//, /^hooks\/useLocalStorage\.ts$/];

type Usage = { writers: Set<string>; readers: Set<string> };

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
  const record = (key: string, file: string, write: boolean) => {
    const u = usage.get(key) ?? { writers: new Set(), readers: new Set() };
    (write ? u.writers : u.readers).add(file);
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
        if (ts.isIdentifier(callee) && callee.text === "useLocalStorage") write = true;
        else if (ts.isPropertyAccessExpression(callee) && /(^|\.)localStorage$/.test(callee.expression.getText(sf))) {
          const method = callee.name.text;
          if (method === "getItem") write = false;
          else if (method === "setItem" || method === "removeItem") write = true;
        }
        if (write !== undefined) {
          const key = resolve(node.arguments[0]);
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          if (key === undefined) unresolved.push(`${rel}:${line + 1}`);
          else record(key, rel, write);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { usage, unresolved };
}

const { usage, unresolved } = scan();
const managed = new Set<string>(MANAGED_KEYS);

describe("localStorage keys", () => {
  it("finds the app's keys (the scan is not silently empty)", () => {
    expect(usage.size).toBeGreaterThanOrEqual(10);
  });

  it("every key resolves to a literal or string constant", () => {
    expect(unresolved).toEqual([]);
  });

  it("each key has one writing module, apart from the listed exceptions", () => {
    const shared = [...usage].filter(([, u]) => u.writers.size > 1).map(([k, u]) => `${k}: ${[...u.writers].sort().join(", ")}`);
    expect(shared.filter(s => !(s.split(":")[0] in SHARED_WRITERS))).toEqual([]);
  });

  it("SHARED_WRITERS has no stale entries (remove a key once one module owns it)", () => {
    const stale = Object.keys(SHARED_WRITERS).filter(k => (usage.get(k)?.writers.size ?? 0) <= 1);
    expect(stale).toEqual([]);
  });

  it("every key is demo-managed or explicitly exempt", () => {
    const uncovered = [...usage.keys()].filter(k => !managed.has(k) && !(k in DEMO_EXEMPT));
    expect(uncovered).toEqual([]);
  });

  it("MANAGED_KEYS and DEMO_EXEMPT only list keys the app uses", () => {
    const unused = [...managed, ...Object.keys(DEMO_EXEMPT)].filter(k => !usage.has(k));
    expect(unused).toEqual([]);
  });
});
