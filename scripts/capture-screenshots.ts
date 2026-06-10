/**
 * Visual capture script for fetchlist design review.
 *
 * Usage:
 *   npx tsx scripts/capture-screenshots.ts                    # fixture data (default)
 *   npx tsx scripts/capture-screenshots.ts --browser chrome   # your real Chrome profile
 *   npx tsx scripts/capture-screenshots.ts --browser firefox  # reads Firefox SQLite
 *   npx tsx scripts/capture-screenshots.ts --local            # target localhost:5173
 *   npx tsx scripts/capture-screenshots.ts --seed path/to/seed.json  # custom fixture
 *
 * The fixture at scripts/fixtures/design-seed.json is the default seed.
 * It contains 3 decks at varying completion, active + received + cancelled orders
 * (with prices on active order cards), and collection data — enough to reach
 * every UI state including the buy list and spend meta.
 *
 * Shots 17, 18, 25, 26, 26b were removed (stale selectors from pre-redesign UI).
 * Replaced by shots 37–53 covering the full orders v2 redesign flows.
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import os from "os";

const OUT_DIR = path.resolve(process.cwd(), "design-review-screenshots");
const CHROME_PROFILE = "/Users/codyparker/Library/Application Support/Google/Chrome";
const SETTLE_MS = 1000;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

const BASE_URL = args.includes("--local")
  ? "http://localhost:5173"
  : "https://fetchlist.kagaiodin.dev";

const browserArg = (() => {
  const idx = args.indexOf("--browser");
  const val = idx !== -1 ? args[idx + 1] : "fixture";
  if (!["chrome", "firefox", "fixture"].includes(val)) {
    console.error(`Unknown --browser value "${val}". Use "chrome", "firefox", or "fixture" (default).`);
    process.exit(1);
  }
  return val as "chrome" | "firefox" | "fixture";
})();

const seedPath = (() => {
  const idx = args.indexOf("--seed");
  return idx !== -1
    ? path.resolve(args[idx + 1])
    : path.resolve(process.cwd(), "scripts/fixtures/design-seed.json");
})();

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Result tracking ───────────────────────────────────────────────────────────

interface AttemptRecord {
  label: string;
  ok: boolean;
  error?: string;
}

interface ShotRecord {
  name: string;
  ok: boolean;
  ts: string;              // ISO timestamp
  durationMs: number;
  error?: string;
  /** Attempt steps that failed before this shot was taken. */
  warnings: AttemptRecord[];
}

const shotLog: ShotRecord[] = [];
// Attempt failures that have occurred since the last shot() call
let pendingWarnings: AttemptRecord[] = [];

const RUN_START = new Date();

async function shot(page: Page, name: string): Promise<void> {
  const t0 = Date.now();
  const warnings = pendingWarnings.splice(0); // claim + clear
  try {
    await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
    const durationMs = Date.now() - t0;
    const dirty = warnings.length > 0;
    console.log(`  ${dirty ? "⚠" : "✓"}  ${name}${dirty ? `  (${warnings.length} step warning${warnings.length !== 1 ? "s" : ""})` : ""}`);
    shotLog.push({ name, ok: true, ts: new Date().toISOString(), durationMs, warnings });
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.error(`  ✗  ${name}: ${msg}`);
    shotLog.push({ name, ok: false, ts: new Date().toISOString(), durationMs, error: msg, warnings });
  }
}

// Wraps an interaction step so a timeout/error skips to the next screenshot
// rather than crashing the whole run.
async function attempt(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`  ⚠  ${label}: ${msg.split("\n")[0]}`);
    pendingWarnings.push({ label, ok: false, error: msg });
    return false;
  }
}

// Click helper with a short timeout so a blocked element fails fast (5s)
// rather than hanging for Playwright's 30s default.
async function click(page: Page, selector: string, opts?: { hasText?: string }): Promise<void> {
  await page.locator(selector, opts).first().click({ timeout: 5_000 });
}

// Close any open modal/sheet. The vendor picker sub-view uses aria-label="Back"
// while the main buy list uses aria-label="Close" — handle both in sequence.
async function closeSheet(page: Page): Promise<void> {
  // If we're in the vendor picker sub-view, go back to the buy list first
  const backBtn = page.locator('button[aria-label="Back"]').first();
  if (await backBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await backBtn.click({ timeout: 5_000 });
    await page.waitForTimeout(400);
  }
  // Now close the main sheet
  const closeBtn = page.locator('button[aria-label="Close"]').first();
  if (await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await closeBtn.click({ timeout: 5_000 });
  } else {
    // Fallback: click backdrop (outside the sheet content)
    await page.locator(".buy-sheet-backdrop").first().click({ timeout: 5_000, position: { x: 10, y: 10 } });
  }
  await page.waitForTimeout(400);
}

// ── Navigation helpers ────────────────────────────────────────────────────────
async function gotoAndSettle(page: Page, url: string): Promise<void> {
  // Reset transient UI state before navigating so reloads don't inherit
  // a collapsed sidebar (fl-sidebar-collapsed) or other modal state.
  await page.evaluate(() => {
    localStorage.setItem("fl-sidebar-collapsed", "false");
  }).catch(() => {});
  await page.goto(url);
  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    // long-poll connections can prevent networkidle — non-fatal
  }
  await page.waitForTimeout(SETTLE_MS);
  // Dismiss onboarding modal if it appears before interacting with anything
  const backdrop = page.locator(".onboarding-backdrop");
  if (await backdrop.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.locator("button", { hasText: "Skip for now" }).click();
    await page.evaluate(() => localStorage.setItem("fetchlist:onboarding:dismissed", "true"));
    await page.waitForTimeout(400);
  }
}

async function clickNav(page: Page, label: string): Promise<void> {
  // hasText matches on full DOM text content (includes hidden spans), so both
  // "Decks" and "My Decks" will match the button that contains both span variants.
  await page.locator("button.nav-btn", { hasText: label }).first().click({ timeout: 5_000 });
  await page.waitForTimeout(SETTLE_MS);
}

// ── Fixture seed ──────────────────────────────────────────────────────────────
async function seedFromFixture(ctx: BrowserContext): Promise<void> {
  if (!fs.existsSync(seedPath)) {
    console.warn(`  Seed file not found: ${seedPath} — launching with empty state`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as Record<string, string>;
  await ctx.addInitScript((entries: Record<string, string>) => {
    for (const [k, v] of Object.entries(entries)) {
      localStorage.setItem(k, v);
    }
  }, raw);
  console.log(`  Seeded ${Object.keys(raw).length} localStorage keys from ${path.basename(seedPath)}`);
}

// ── Firefox localStorage reader ───────────────────────────────────────────────
function findFirefoxProfile(): string | null {
  const base = path.join(os.homedir(), "Library/Application Support/Firefox/Profiles");
  if (!fs.existsSync(base)) return null;
  const entries = fs.readdirSync(base);
  const profile =
    entries.find(e => e.endsWith(".default-release")) ??
    entries.find(e => e.endsWith(".default")) ??
    entries[0];
  return profile ? path.join(base, profile) : null;
}

function readFirefoxLocalStorage(origin: string): Record<string, string> {
  const profileDir = findFirefoxProfile();
  if (!profileDir) { console.warn("  Firefox profile not found"); return {}; }

  const dbPath = path.join(profileDir, "webappsstore.sqlite");
  if (!fs.existsSync(dbPath)) { console.warn("  webappsstore.sqlite not found:", profileDir); return {}; }

  const tmp = path.join(os.tmpdir(), `webappsstore-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, tmp);

  try {
    const db = new DatabaseSync(tmp);
    const url = new URL(origin);
    const reversedHost = url.hostname.split(".").reverse().join(".");
    const proto = url.protocol.replace(":", "");
    const port = url.port || (proto === "https" ? "443" : "80");
    const originKey = `${reversedHost}.:${proto}:${port}`;

    const rows = db.prepare(
      "SELECT key, value FROM webappsstore2 WHERE originKey = ?"
    ).all(originKey) as Array<{ key: string; value: string }>;
    db.close();

    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    console.log(`  Read ${rows.length} keys from Firefox (${dbPath})`);
    return result;
  } catch (e) {
    console.warn("  Firefox SQLite read failed:", e instanceof Error ? e.message : e);
    return {};
  } finally {
    fs.unlinkSync(tmp);
  }
}

// ── Context factory ───────────────────────────────────────────────────────────
async function buildContext(viewport: { width: number; height: number }): Promise<{
  ctx: BrowserContext;
  persistent: boolean;
}> {
  if (browserArg === "fixture") {
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport });
    await seedFromFixture(ctx);
    return { ctx, persistent: false };
  }

  if (browserArg === "firefox") {
    console.log("Reading localStorage from Firefox profile…");
    const data = readFirefoxLocalStorage(BASE_URL);
    if (Object.keys(data).length === 0) {
      console.warn("  No data found for this origin in Firefox — screenshots will show empty state");
    }
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport });
    if (Object.keys(data).length > 0) {
      await ctx.addInitScript((entries: Record<string, string>) => {
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      }, data);
    }
    return { ctx, persistent: false };
  }

  // chrome — try persistent profile, fall back to fixture
  try {
    const ctx = await chromium.launchPersistentContext(CHROME_PROFILE, {
      headless: false,
      viewport,
      args: ["--disable-extensions", "--no-first-run", "--disable-sync"],
    });
    console.log("Using Chrome profile:", CHROME_PROFILE);
    return { ctx, persistent: true };
  } catch (err) {
    console.warn("Chrome profile unavailable:", err instanceof Error ? err.message : err);
    console.log("Falling back to fixture seed…");
    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext({ viewport });
    await seedFromFixture(ctx);
    return { ctx, persistent: false };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\nFetchlist design review capture → ${OUT_DIR}`);
  console.log(`Source: ${browserArg === "fixture" ? `fixture (${path.basename(seedPath)})` : browserArg}\n`);

  // Read seed data once — used both for the main context and the empty-collection sub-context
  const seedData: Record<string, string> = browserArg === "fixture" && fs.existsSync(seedPath)
    ? JSON.parse(fs.readFileSync(seedPath, "utf-8"))
    : {};

  const { ctx, persistent } = await buildContext({ width: 1440, height: 900 });
  const page = await ctx.newPage();

  try {

    // ── DESKTOP (1440×900) ──────────────────────────────────────────────────
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log("── Desktop 1440×900 ──");

    // Navigate once — capture onboarding if present, then dismiss
    await page.goto(BASE_URL);
    try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
    await page.waitForTimeout(SETTLE_MS);

    const hasOnboarding = await page.locator(".onboarding-backdrop").isVisible({ timeout: 1500 }).catch(() => false);
    if (hasOnboarding) {
      await shot(page, "00-desktop-onboarding.png");
      await attempt("dismiss onboarding", async () => {
        await page.locator("button", { hasText: "Skip for now" }).click();
        await page.evaluate(() => localStorage.setItem("fetchlist:onboarding:dismissed", "true"));
        await page.waitForTimeout(400);
      });
    }

    // 01 — Decks tab, no deck selected
    await shot(page, "01-desktop-decks-empty.png");

    // 02 — Deck selected, checklist open
    await attempt("select first deck", async () => {
      await page.locator(".deck-list .deck-item").first().click();
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "02-desktop-decks-selected.png");

    // 03 — Deck with progress: toggle "Missing only" so the view is distinct from 02
    await attempt("toggle missing only", async () => {
      await click(page, "button", { hasText: "Missing only" });
      await page.waitForTimeout(400);
    });
    await shot(page, "03-desktop-decks-missing-only.png");
    // Reset filter
    await attempt("untoggle missing only", async () => {
      await click(page, "button", { hasText: "Missing only" });
      await page.waitForTimeout(300);
    });

    // 35 — Sidebar in collapsed rail mode
    await attempt("collapse sidebar to rail", async () => {
      await click(page, 'button[aria-label="Collapse sidebar"]');
      await page.waitForTimeout(600);
    });
    await shot(page, "35-desktop-sidebar-rail.png");
    await attempt("expand sidebar", async () => {
      await click(page, 'button[aria-label="Expand sidebar"]');
      await page.waitForTimeout(400);
    });

    // 36 — Extra Info section expanded (token chips + alt printings)
    await attempt("scroll to extra info section", async () => {
      await page.locator("#extra-info").first().scrollIntoViewIfNeeded({ timeout: 3_000 });
      await page.waitForTimeout(300);
    });
    await attempt("open extra info section", async () => {
      await click(page, ".ei-toggle");
      await page.waitForTimeout(400);
    });
    await shot(page, "36-desktop-extra-info.png");
    await attempt("close extra info and scroll up", async () => {
      await click(page, ".ei-toggle");
      await page.waitForTimeout(200);
      await page.evaluate(() => window.scrollTo(0, 0));
    });

    // 04 — Collection tab
    await attempt("nav to Collection", () => clickNav(page, "My Collection"));
    await shot(page, "04-desktop-collection.png");

    // 05 — Orders tab
    await attempt("nav to Orders", () => clickNav(page, "Orders"));
    await shot(page, "05-desktop-orders.png");

    // 06 — Buy list modal open
    await attempt("nav to Decks for buy list", () => clickNav(page, "My Decks"));
    await attempt("select deck with need_to_buy cards", async () => {
      // Pick the first deck that has a visible buy-list button
      const decks = page.locator(".deck-list .deck-item");
      const count = await decks.count();
      for (let i = 0; i < count; i++) {
        await decks.nth(i).click();
        await page.waitForTimeout(600);
        if (await page.locator(".buy-list-btn").isVisible({ timeout: 800 }).catch(() => false)) break;
      }
    });
    const buyBtnVisible = await page.locator(".buy-list-btn").isVisible({ timeout: 1000 }).catch(() => false);
    if (buyBtnVisible) {
      await attempt("open buy list", async () => {
        await page.locator(".buy-list-btn").click();
        await page.waitForTimeout(SETTLE_MS);
      });
      await shot(page, "06-desktop-buy-list-open.png");
      await attempt("close buy list", () => closeSheet(page));
    } else {
      console.warn("  ⚠  no deck has need_to_buy cards — skipping 06");
      shotLog.push({ name: "06-desktop-buy-list-open.png", ok: false, ts: new Date().toISOString(), durationMs: 0, error: "no need_to_buy cards", warnings: [] });
    }

    // 07 — Light mode
    await attempt("open overflow menu", () => click(page, ".header-overflow-btn"));
    await page.waitForTimeout(300);
    await attempt("open theme settings", () => click(page, ".settings-btn"));
    await page.waitForTimeout(300);
    await attempt("switch to light mode", () => click(page, ".mode-segment-btn", { hasText: "Light" }));
    await page.waitForTimeout(600);
    await shot(page, "07-desktop-theme-light.png");
    // Restore dark + close menus
    await attempt("restore dark mode", async () => {
      await click(page, ".mode-segment-btn", { hasText: "Dark" });
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    });

    // 08 — Import deck modal open
    await attempt("nav to Decks for import", () => clickNav(page, "My Decks"));
    await attempt("open import panel", async () => {
      await click(page, ".sidebar-header .btn-primary", { hasText: "New" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "08-desktop-import-modal.png");
    await attempt("close import panel", async () => {
      await click(page, ".import-panel .btn-secondary", { hasText: "Cancel" });
      await page.waitForTimeout(300);
    });

    // ── Orders redesign shots (37–48) ─────────────────────────────────────
    await attempt("nav to Orders", () => clickNav(page, "Orders"));

    // 47 — Overdue meta (order-001 is past its expected arrival)
    await shot(page, "47-desktop-orders-overdue-meta.png");

    // 48 — Spend meta (order-001 now has prices in seed)
    // Same view as 47 — both overdue + spend meta show on Active tab
    await shot(page, "48-desktop-orders-spend-meta.png");

    // 42 — Active OCard expanded (timeline left + line items right)
    await attempt("expand first active order", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await shot(page, "42-desktop-orders-expanded-active.png");
    // Collapse
    await attempt("collapse active order", async () => {
      await page.locator(".ocard.expanded .ocard-chev").first().click({ timeout: 5_000 });
      await page.waitForTimeout(400);
    });

    // 43 — Received OCard expanded
    await attempt("click Received chip", async () => {
      await click(page, ".orders-chip", { hasText: "Received" });
      await page.waitForTimeout(400);
    });
    await attempt("expand first received order", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await shot(page, "43-desktop-orders-expanded-received.png");
    await attempt("collapse received order", async () => {
      await page.locator(".ocard.expanded .ocard-chev").first().click({ timeout: 5_000 });
      await page.waitForTimeout(400);
    });

    // 44 — Cancelled tab (collapsed rows)
    await attempt("click Cancelled chip", async () => {
      await click(page, ".orders-chip", { hasText: "Cancelled" });
      await page.waitForTimeout(400);
    });
    await shot(page, "44-desktop-orders-cancelled.png");

    // 44b — Cancelled OCard expanded (shows Re-order CTA)
    await attempt("expand cancelled order", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await shot(page, "44b-desktop-orders-cancelled-expanded.png");
    await attempt("collapse cancelled order", async () => {
      await page.locator(".ocard.expanded .ocard-chev").first().click({ timeout: 5_000 });
      await page.waitForTimeout(400);
    });

    // Back to Active for remaining shots
    await attempt("click Active chip", async () => {
      await click(page, ".orders-chip", { hasText: "Active" });
      await page.waitForTimeout(400);
    });

    // 37 — NewOrderSheet Step 1 (vendor selection)
    await attempt("open new order sheet step 1", async () => {
      await click(page, "button", { hasText: "New order" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "37-desktop-orders-new-sheet-step1.png");

    // 38 — Step 2 with card search active
    await attempt("advance to step 2", async () => {
      // Select first vendor in the list so Continue is enabled
      await page.locator(".nos-vrow").first().click({ timeout: 5_000 });
      await page.waitForTimeout(200);
      await click(page, "button", { hasText: "Continue →" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await attempt("type card search query", async () => {
      await page.locator(".nos-card-search").fill("Force");
      await page.waitForTimeout(400);
    });
    await shot(page, "38-desktop-orders-new-sheet-step2.png");

    // 39 — Step 2 with card added and qty/price filled
    await attempt("add card from search result", async () => {
      const result = page.locator(".nos-result").first();
      if (await result.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await result.click({ timeout: 5_000 });
      } else {
        // Freeform add
        await page.locator(".nos-card-search").press("Enter");
      }
      await page.waitForTimeout(400);
    });
    await attempt("fill price field", async () => {
      await page.locator(".nos-price-input").first().fill("18.99");
      await page.waitForTimeout(200);
    });
    await shot(page, "39-desktop-orders-new-sheet-step2-filled.png");

    // 40 — Step 3 order details
    await attempt("advance to step 3", async () => {
      await click(page, "button", { hasText: "Continue →" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "40-desktop-orders-new-sheet-step3.png");

    // 41 — Step 4 success
    await attempt("submit order (step 4)", async () => {
      await click(page, "button", { hasText: "Create order" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "41-desktop-orders-new-sheet-done.png");
    await attempt("close new order sheet", async () => {
      await click(page, "button[aria-label='Close']");
      await page.waitForTimeout(400);
    });

    // 45 — Edit order sheet (pre-filled, with Save + Delete)
    await attempt("expand first active order for edit", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await attempt("click Edit button on active order", async () => {
      await page.locator(".ocard.expanded .btn-ghost", { hasText: "Edit" }).first().click({ timeout: 5_000 });
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "45-desktop-orders-edit-sheet.png");
    await attempt("close edit sheet", async () => {
      await click(page, "button[aria-label='Close']");
      await page.waitForTimeout(400);
    });

    // 46 + 46b — Light mode orders
    await attempt("open overflow menu for light mode (orders)", () => click(page, ".header-overflow-btn"));
    await page.waitForTimeout(300);
    await attempt("open theme settings (orders)", () => click(page, ".settings-btn"));
    await page.waitForTimeout(300);
    await attempt("switch to light mode (orders)", () => click(page, ".mode-segment-btn", { hasText: "Light" }));
    await page.waitForTimeout(600);
    // Ensure we're on Orders tab
    await attempt("nav to Orders (light mode)", () => clickNav(page, "Orders"));
    await shot(page, "46-desktop-orders-light-mode.png");
    // 46b — expanded ocard in light mode
    await attempt("expand first order in light mode", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await shot(page, "46b-desktop-orders-expanded-light-mode.png");
    await attempt("collapse order light mode", async () => {
      await page.locator(".ocard.expanded .ocard-chev").first().click({ timeout: 5_000 });
      await page.waitForTimeout(300);
    });
    // Restore dark — split into separate attempts so a failing step doesn't abort the rest
    await attempt("open overflow for dark restore", () => click(page, ".header-overflow-btn"));
    await page.waitForTimeout(300);
    await attempt("open theme settings for dark restore", () => click(page, ".settings-btn"));
    await page.waitForTimeout(300);
    await attempt("switch back to dark mode", () => click(page, ".mode-segment-btn", { hasText: "Dark" }));
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");

    // 19 — Collection import confirmation (inject a fake CSV to trigger the banner)
    // Hard reload first — the orders section leaves theme/panel state that can block nav
    await gotoAndSettle(page, BASE_URL);
    await attempt("nav to Collection for import", () => clickNav(page, "My Collection"));
    await attempt("trigger CSV replace confirmation", async () => {
      const csvContent = "Card Name,Set Code,Collector Number,Quantity,Foil\nLightning Bolt,M11,149,4,No";
      const tmpCsv = path.join(os.tmpdir(), "fetchlist-test-collection.csv");
      fs.writeFileSync(tmpCsv, csvContent);
      await page.locator('input[type="file"][accept=".csv"]').setInputFiles(tmpCsv, { timeout: 5_000 });
      await page.waitForTimeout(600);
      fs.unlinkSync(tmpCsv);
    });
    await shot(page, "19-desktop-collection-import-confirm.png");
    await attempt("cancel CSV replace", async () => {
      const cancelBtn = page.locator(".collection-confirm-actions .btn-ghost").first();
      if (await cancelBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await cancelBtn.click({ timeout: 5_000 });
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(300);
    });

    // 20 — Buy flow vendor picker
    await attempt("nav to Decks for vendor picker", () => clickNav(page, "My Decks"));
    await attempt("select deck with buy-list for vendor picker", async () => {
      const decks = page.locator(".deck-list .deck-item");
      const count = await decks.count();
      for (let i = 0; i < count; i++) {
        await decks.nth(i).click({ timeout: 5_000 });
        await page.waitForTimeout(500);
        if (await page.locator(".buy-list-btn").isVisible({ timeout: 800 }).catch(() => false)) break;
      }
    });
    if (await page.locator(".buy-list-btn").isVisible({ timeout: 1000 }).catch(() => false)) {
      await attempt("open buy list for vendor step", async () => {
        await page.locator(".buy-list-btn").click({ timeout: 5_000 });
        await page.waitForTimeout(SETTLE_MS);
      });
      await attempt("click choose vendor", async () => {
        await click(page, ".buy-sheet-btn-accent", { hasText: "Choose vendor" });
        await page.waitForTimeout(SETTLE_MS);
      });
      await shot(page, "20-desktop-buy-flow-vendor.png");
      await attempt("close vendor picker", () => closeSheet(page));
    } else {
      shotLog.push({ name: "20-desktop-buy-flow-vendor.png", ok: false, ts: new Date().toISOString(), durationMs: 0, error: "buy-list-btn not visible", warnings: [] });
    }

    // 22 — Source picker open on a card row
    await attempt("nav to Decks for source picker", () => clickNav(page, "My Decks"));
    await attempt("select Atraxa for source picker", async () => {
      await page.locator(".deck-list .deck-item").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await attempt("open source picker on unacquired card", async () => {
      // Click the source tag on the first non-acquired card row
      await page.locator(".card-row:not(.acquired) .source-tag").first().click({ timeout: 5_000 });
      await page.waitForTimeout(400);
    });
    await shot(page, "22-desktop-source-picker.png");
    await attempt("close source picker", () => page.keyboard.press("Escape"));
    await page.waitForTimeout(300);

    // 23 — Bulk tag mode
    await attempt("open bulk tag mode", async () => {
      await click(page, "button", { hasText: "Bulk tag" });
      await page.waitForTimeout(600);
    });
    await shot(page, "23-desktop-bulk-tag.png");
    await attempt("exit bulk tag mode", async () => {
      await click(page, "button", { hasText: "Done" });
      await page.waitForTimeout(300);
    });

    // 24 — Edit mode
    await attempt("open edit mode", async () => {
      await click(page, "button", { hasText: "Edit" });
      await page.waitForTimeout(600);
    });
    await shot(page, "24-desktop-edit-mode.png");
    await attempt("exit edit mode", async () => {
      await click(page, "button", { hasText: "Done" });
      await page.waitForTimeout(300);
    });

    // 28 — Deck rename inline form
    await attempt("nav to Decks for rename", () => clickNav(page, "My Decks"));
    await attempt("select first deck for rename", async () => {
      await page.locator(".deck-list .deck-item").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await attempt("open rename form", async () => {
      // Use JS click to bypass the deck-title-wrap hover overlay that intercepts pointer events
      await page.locator("button.rename-btn").first().evaluate(el => (el as HTMLElement).click());
      await page.waitForTimeout(400);
    });
    await shot(page, "28-desktop-deck-rename.png");
    await attempt("cancel rename", async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    // 29 — Format edit inline form
    await attempt("open format edit", async () => {
      await click(page, "button.deck-format-meta");
      await page.waitForTimeout(400);
    });
    await shot(page, "29-desktop-deck-format-edit.png");
    await attempt("cancel format edit", async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    // 30 — Export dropdown open
    await attempt("open export dropdown", async () => {
      await click(page, "button", { hasText: "Export" });
      await page.waitForTimeout(400);
    });
    await shot(page, "30-desktop-export-dropdown.png");
    await attempt("close export dropdown", async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    // 31 — Undo toast (trigger by clearing collection via Bulk edit panel)
    await attempt("nav to Collection for undo toast", () => clickNav(page, "My Collection"));
    await attempt("open bulk edit panel", async () => {
      await click(page, "button", { hasText: "Bulk edit" });
      await page.waitForTimeout(600);
    });
    await attempt("click clear collection", async () => {
      await click(page, "button.bulk-clear-btn", { hasText: "Clear entire collection" });
      await page.waitForTimeout(400);
    });
    await attempt("confirm clear", async () => {
      // Second click on the confirm variant of the same button
      await click(page, "button.bulk-clear-btn", { hasText: "Clear entire collection" });
      await page.waitForTimeout(600);
    });
    await shot(page, "31-desktop-undo-toast.png");

    // 27 — Empty collection state (separate context, no collection keys in seed)
    {
      const emptyBrowser = await chromium.launch({ headless: false });
      try {
        const emptyCtx2 = await emptyBrowser.newContext({ viewport: { width: 1440, height: 900 } });
        const emptySeed = Object.fromEntries(
          Object.entries(seedData).filter(([k]) => !k.includes("collection"))
        );
        await emptyCtx2.addInitScript((entries: Record<string, string>) => {
          for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
        }, emptySeed);
        const emptyPage2 = await emptyCtx2.newPage();
        await emptyPage2.goto(BASE_URL);
        try { await emptyPage2.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
        await emptyPage2.waitForTimeout(SETTLE_MS);
        await emptyPage2.locator("button.nav-btn", { hasText: "Collection" }).first().click({ timeout: 5_000 });
        await emptyPage2.waitForTimeout(SETTLE_MS);
        await shot(emptyPage2, "27-desktop-collection-empty.png");
      } catch (e) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        console.error(`  ✗  27-desktop-collection-empty.png: ${msg}`);
        shotLog.push({ name: "27-desktop-collection-empty.png", ok: false, ts: new Date().toISOString(), durationMs: 0, error: msg, warnings: [] });
      } finally {
        await emptyBrowser.close();
      }
    }

    // 32 — Header overflow menu open
    await attempt("nav to Decks for overflow menu", () => clickNav(page, "My Decks"));
    await attempt("open header overflow menu", async () => {
      await click(page, 'button[aria-label="More options"]');
      await page.waitForTimeout(400);
    });
    await shot(page, "32-desktop-overflow-menu.png");
    await attempt("close overflow menu", async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    // 33 — Collection bulk edit panel
    await attempt("nav to Collection for bulk edit panel", () => clickNav(page, "My Collection"));
    await attempt("open bulk edit panel for shot", async () => {
      await click(page, "button", { hasText: "Bulk edit" });
      await page.waitForTimeout(600);
    });
    await shot(page, "33-desktop-collection-bulk-edit.png");
    await attempt("close bulk edit panel", async () => {
      await click(page, 'button[aria-label="Close bulk edit"]');
      await page.waitForTimeout(300);
    });

    // 34 — Profile import panel (in sidebar, always visible on desktop)
    await attempt("nav to Decks for profile import panel", () => clickNav(page, "My Decks"));
    await attempt("open profile import panel", async () => {
      await click(page, "button", { hasText: "Import data" });
      await page.waitForTimeout(600);
    });
    await shot(page, "34-desktop-profile-import.png");
    await attempt("close profile import panel", async () => {
      await click(page, "button", { hasText: "Import data" });
      await page.waitForTimeout(300);
    });

    // ── MOBILE (390×844) ───────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    console.log("\n── Mobile 390×844 ──");

    await gotoAndSettle(page, BASE_URL);
    await attempt("nav to Decks (mobile)", () => clickNav(page, "Decks"));
    await shot(page, "09-mobile-decks.png");

    // 21 — Mobile deck picker sheet (open but nothing selected yet)
    await attempt("open mobile deck picker sheet", async () => {
      await page.locator(".mobile-deck-current").first().click();
      await page.waitForTimeout(500);
    });
    await shot(page, "21-mobile-deck-picker.png");

    // 10 — Deck selected via mobile picker
    await attempt("select deck from mobile picker", async () => {
      await page.locator(".deck-picker-list .deck-item").first().click();
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "10-mobile-deck-selected.png");

    // 11 — Mobile collection
    await attempt("nav to Collection (mobile)", () => clickNav(page, "Collection"));
    await shot(page, "11-mobile-collection.png");

    // 12 — Mobile orders
    await attempt("nav to Orders (mobile)", () => clickNav(page, "Orders"));
    await shot(page, "12-mobile-orders.png");

    // 49 — Mobile order detail sheet (tap a row)
    await attempt("tap first order row on mobile", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await shot(page, "49-mobile-orders-detail-sheet.png");
    await attempt("close mobile detail sheet", async () => {
      await page.locator(".ocard-mob-back, button[aria-label='Back']").first().click({ timeout: 5_000 });
      await page.waitForTimeout(400);
    });

    // 50 — Mobile new order sheet (slides up from bottom)
    await attempt("open new order sheet (mobile)", async () => {
      await click(page, "button", { hasText: "New order" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await shot(page, "50-mobile-orders-new-sheet.png");
    await attempt("close new order sheet (mobile)", async () => {
      await click(page, "button[aria-label='Close']");
      await page.waitForTimeout(400);
    });

    // 13 — Mobile nav bar visible
    await attempt("nav to Decks (mobile nav)", () => clickNav(page, "Decks"));
    await shot(page, "13-mobile-nav.png");

    // 14 — Mobile buy list
    await attempt("select deck with buy-list on mobile", async () => {
      const decks = page.locator(".deck-picker-list .deck-item");
      // Open picker first
      await page.locator(".mobile-deck-current").first().click();
      await page.waitForTimeout(400);
      const count = await decks.count();
      for (let i = 0; i < count; i++) {
        await decks.nth(i).click();
        await page.waitForTimeout(600);
        if (await page.locator(".buy-list-btn").isVisible({ timeout: 800 }).catch(() => false)) break;
        // re-open picker for next iteration
        if (i < count - 1) {
          await page.locator(".mobile-deck-current").first().click();
          await page.waitForTimeout(300);
        }
      }
    });
    const mobileBuyVisible = await page.locator(".buy-list-btn").isVisible({ timeout: 1000 }).catch(() => false);
    if (mobileBuyVisible) {
      await attempt("open buy list (mobile)", async () => {
        await page.locator(".buy-list-btn").click();
        await page.waitForTimeout(SETTLE_MS);
      });
      await shot(page, "14-mobile-buy-list.png");
      await attempt("close buy list (mobile)", () => closeSheet(page));
    } else {
      console.warn("  ⚠  buy list not visible on mobile — skipping 14");
      shotLog.push({ name: "14-mobile-buy-list.png", ok: false, ts: new Date().toISOString(), durationMs: 0, error: "buy-list-btn not visible", warnings: [] });
    }

    // ── TABLET (768×1024) ──────────────────────────────────────────────────
    await page.setViewportSize({ width: 768, height: 1024 });
    console.log("\n── Tablet 768×1024 ──");

    await gotoAndSettle(page, BASE_URL);
    await attempt("nav to Decks (tablet)", () => clickNav(page, "Decks"));
    await shot(page, "15-tablet-decks.png");

    await attempt("nav to Collection (tablet)", () => clickNav(page, "Collection"));
    await shot(page, "16-tablet-collection.png");

    // 51 — Tablet orders list
    await attempt("nav to Orders (tablet)", () => clickNav(page, "Orders"));
    await shot(page, "51-tablet-orders.png");

    // 51b — Tablet orders expanded
    await attempt("expand first order (tablet)", async () => {
      await page.locator(".ocard").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await shot(page, "51b-tablet-orders-expanded.png");
    await attempt("collapse order (tablet)", async () => {
      await page.locator(".ocard.expanded .ocard-chev").first().click({ timeout: 5_000 });
      await page.waitForTimeout(300);
    });

    // ── Empty state shots (separate contexts) ──────────────────────────────
    // 52 — Desktop orders empty state
    {
      const emptyBrowser = await chromium.launch({ headless: false });
      try {
        const emptyCtx3 = await emptyBrowser.newContext({ viewport: { width: 1440, height: 900 } });
        const emptySeed3 = Object.fromEntries(
          Object.entries(seedData).filter(([k]) => !k.includes("orders"))
        );
        await emptyCtx3.addInitScript((entries: Record<string, string>) => {
          for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
        }, emptySeed3);
        const emptyPage3 = await emptyCtx3.newPage();
        await emptyPage3.goto(BASE_URL);
        try { await emptyPage3.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
        await emptyPage3.waitForTimeout(SETTLE_MS);
        await emptyPage3.locator("button.nav-btn", { hasText: "Orders" }).first().click({ timeout: 5_000 });
        await emptyPage3.waitForTimeout(SETTLE_MS);
        await shot(emptyPage3, "52-desktop-orders-empty.png");
      } catch (e) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        console.error(`  ✗  52-desktop-orders-empty.png: ${msg}`);
        shotLog.push({ name: "52-desktop-orders-empty.png", ok: false, ts: new Date().toISOString(), durationMs: 0, error: msg, warnings: [] });
      } finally {
        await emptyBrowser.close();
      }
    }

    // 53 — Mobile orders empty state
    {
      const emptyBrowser = await chromium.launch({ headless: false });
      try {
        const emptyCtx4 = await emptyBrowser.newContext({ viewport: { width: 390, height: 844 } });
        const emptySeed4 = Object.fromEntries(
          Object.entries(seedData).filter(([k]) => !k.includes("orders"))
        );
        await emptyCtx4.addInitScript((entries: Record<string, string>) => {
          for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
        }, emptySeed4);
        const emptyPage4 = await emptyCtx4.newPage();
        await emptyPage4.goto(BASE_URL);
        try { await emptyPage4.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
        await emptyPage4.waitForTimeout(SETTLE_MS);
        await emptyPage4.locator("button.nav-btn", { hasText: "Orders" }).first().click({ timeout: 5_000 });
        await emptyPage4.waitForTimeout(SETTLE_MS);
        await shot(emptyPage4, "53-mobile-orders-empty.png");
      } catch (e) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        console.error(`  ✗  53-mobile-orders-empty.png: ${msg}`);
        shotLog.push({ name: "53-mobile-orders-empty.png", ok: false, ts: new Date().toISOString(), durationMs: 0, error: msg, warnings: [] });
      } finally {
        await emptyBrowser.close();
      }
    }

  } finally {
    await page.close();
    if (persistent) {
      await ctx.close();
    } else {
      await ctx.browser()?.close();
    }
  }

  // ── Write log file ────────────────────────────────────────────────────────
  const logPayload = {
    runAt: RUN_START.toISOString(),
    source: browserArg === "fixture" ? `fixture:${path.basename(seedPath)}` : browserArg,
    baseUrl: BASE_URL,
    shots: shotLog,
    summary: {
      total: shotLog.length,
      succeeded: shotLog.filter(s => s.ok).length,
      failed: shotLog.filter(s => !s.ok).length,
      dirty: shotLog.filter(s => s.ok && s.warnings.length > 0).length,
    },
  };
  const logPath = path.join(OUT_DIR, "capture-log.json");
  fs.writeFileSync(logPath, JSON.stringify(logPayload, null, 2));

  // ── Console summary ───────────────────────────────────────────────────────
  const { total, succeeded, failed, dirty } = logPayload.summary;

  console.log(`\n${"─".repeat(56)}`);
  console.log(`Capture complete: ${succeeded}/${total} succeeded, ${failed} failed, ${dirty} dirty`);
  console.log(`Log: ${logPath}\n`);

  if (failed > 0) {
    console.log("Failed shots:");
    for (const s of shotLog.filter(r => !r.ok)) {
      console.log(`  ✗  ${s.name}${s.error ? ": " + s.error.split("\n")[0] : ""}`);
    }
    console.log("");
  }

  if (dirty > 0) {
    console.log("Shots captured with step warnings (may show wrong state):");
    for (const s of shotLog.filter(r => r.ok && r.warnings.length > 0)) {
      console.log(`  ⚠  ${s.name}`);
      for (const w of s.warnings) {
        console.log(`       • ${w.label}: ${w.error?.split("\n")[0] ?? "unknown error"}`);
      }
    }
    console.log("");
  }

  if (failed === 0 && dirty === 0) {
    console.log("All shots clean ✓");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
