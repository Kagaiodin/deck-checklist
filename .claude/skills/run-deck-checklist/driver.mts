/**
 * Agent driver for deck-checklist. Seeds the app with sample data, opens a view in headless Chromium,
 * optionally runs a named flow, takes a screenshot, and fails on console/page errors.
 *
 *   npx tsx .claude/skills/run-deck-checklist/driver.mts [--view decks|collection|orders] [--width 1280]
 *        [--flow orders] [--out <dir>] [--empty]
 *
 * Expects the dev server on :5173 (starts one itself if nothing is listening, and stops only that one).
 * Seed data is the demo dataset written as ordinary data (demo mode is NOT switched on), so everything behaves like a
 * real profile: orders can be received, the collection can change, nothing is isolated or restored.
 */
import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { buildDemoData } from "../../../src/features/demo/demoData.ts";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const VIEW = arg("view", "decks")!;
const WIDTH = Number(arg("width", "1280"));
const FLOW = arg("flow");
const OUT = arg("out", "/tmp/deck-checklist-shots")!;
const EMPTY = process.argv.includes("--empty");

const NAV_LABEL: Record<string, string> = { decks: "Decks", collection: "Collection", orders: "Transactions" };
assert.ok(NAV_LABEL[VIEW], `--view must be one of ${Object.keys(NAV_LABEL).join(", ")}`);

async function up() {
  try { return (await fetch(BASE)).ok; } catch { return false; }
}

let server: ChildProcess | null = null;
if (!(await up())) {
  server = spawn("npx", ["vite", "--port", "5173", "--strictPort"], { stdio: "ignore" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000));
  assert.ok(await up(), "dev server did not start on :5173");
}

const read = (page: Page) => page.evaluate(() => ({
  orders: JSON.parse(localStorage.getItem("mtg-checklist-orders-v1") ?? "[]"),
  collection: JSON.parse(localStorage.getItem("mtg-checklist-collection-v2") ?? "{}"),
  decks: JSON.parse(localStorage.getItem("mtg-checklist-decks") ?? "[]"),
}));
const qty = (c: Record<string, { quantity: number }[]>, name: string) => (c[name] ?? []).reduce((n, p) => n + p.quantity, 0);
const statusOf = (s: Awaited<ReturnType<typeof read>>, id: string) => s.orders.find((o: { id: string }) => o.id === id)?.status;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
  const seed = EMPTY ? {} : (buildDemoData(Date.now()) as Record<string, string>);
  await ctx.addInitScript((values) => {
    if (sessionStorage.getItem("seeded")) return; // seed once per tab so reloads keep the app's own writes
    sessionStorage.setItem("seeded", "1");
    for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v as string);
    localStorage.setItem("fetchlist:onboarding:dismissed", "true");
  }, seed);

  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE);

  if (VIEW !== "decks") await page.locator("button.nav-btn", { hasText: NAV_LABEL[VIEW] }).first().click();

  if (FLOW === "orders") {
    // Mark the first active Card Kingdom order received, then cancel the TCGplayer order; check storage after each.
    await page.locator(".ocard").first().waitFor({ timeout: 5000 });
    const before = await read(page);
    const ck = page.locator(".ocard", { hasText: "Card Kingdom" }).filter({ has: page.locator(".btn-recv") }).first();
    await ck.hover();
    await ck.locator(".btn-recv").first().click();
    await page.waitForTimeout(300);
    const recv = await read(page);
    assert.equal(statusOf(recv, "demo-order-1"), "received");
    assert.equal(qty(recv.collection, "sol ring"), qty(before.collection, "sol ring") + 1, "Sol Ring merged");
    assert.equal(qty(recv.collection, "arcane signet"), qty(before.collection, "arcane signet") + 1, "Arcane Signet merged");

    const tcg = page.locator(".ocard", { hasText: "TCGplayer" }).first();
    await tcg.locator(".ocard-vendor-name").click();
    await tcg.getByRole("button", { name: "Cancel order" }).click();
    await page.waitForTimeout(300);
    const canc = await read(page);
    const notes = canc.decks.flatMap((d: { notifications?: { orderId: string; type: string }[] }) => d.notifications ?? [])
      .filter((n: { orderId: string }) => n.orderId === "demo-order-2");
    assert.equal(statusOf(canc, "demo-order-2"), "cancelled");
    assert.ok(notes.length >= 1 && notes.every((n: { type: string }) => n.type === "order_cancelled"), "cancel notification added");

    await page.reload();
    const after = await read(page);
    assert.equal(statusOf(after, "demo-order-1"), "received");
    assert.equal(statusOf(after, "demo-order-2"), "cancelled");
    console.log("flow orders: OK (received, cancelled, persisted across reload)");
  } else if (FLOW) {
    throw new Error(`unknown --flow ${FLOW} (known: orders)`);
  }

  const shot = `${OUT}/${VIEW}-${WIDTH}${FLOW ? `-${FLOW}` : ""}.png`;
  await page.screenshot({ path: shot });
  console.log("screenshot:", shot);
  assert.deepEqual(errors, [], "console/page errors");
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  server?.kill();
}
process.exit(failed ? 1 : 0);
