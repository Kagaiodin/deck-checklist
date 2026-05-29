/**
 * Visual capture script for fetchlist design review.
 *
 * Usage:
 *   npx tsx scripts/capture-screenshots.ts                    # fixture data (default)
 *   npx tsx scripts/capture-screenshots.ts --browser chrome   # your real Chrome profile
 *   npx tsx scripts/capture-screenshots.ts --browser firefox  # reads Firefox SQLite
 *   npx tsx scripts/capture-screenshots.ts --seed path/to/seed.json  # custom fixture
 *
 * The fixture at scripts/fixtures/design-seed.json is the default seed.
 * It contains 3 decks at varying completion, active + received orders, and
 * collection data — enough to reach every UI state including the buy list.
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import os from "os";

const BASE_URL = "https://fetchlist.kagaiodin.dev";
const OUT_DIR = path.resolve(process.cwd(), "design-review-screenshots");
const CHROME_PROFILE = "/Users/codyparker/Library/Application Support/Google/Chrome";
const SETTLE_MS = 1000;

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

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
const results: { name: string; ok: boolean; error?: string }[] = [];

async function shot(page: Page, name: string): Promise<void> {
  try {
    await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: false });
    console.log(`  ✓  ${name}`);
    results.push({ name, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.error(`  ✗  ${name}: ${msg}`);
    results.push({ name, ok: false, error: msg });
  }
}

// Wraps an interaction step so a timeout/error skips to the next screenshot
// rather than crashing the whole run.
async function attempt(label: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.warn(`  ⚠  ${label}: ${msg}`);
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
      results.push({ name: "06-desktop-buy-list-open.png", ok: false, error: "no need_to_buy cards" });
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

    // 17 — New order form open with vendor typed
    await attempt("nav to Orders for create form", () => clickNav(page, "Orders"));
    await attempt("open new order form", async () => {
      await click(page, "button", { hasText: "New order" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await attempt("type vendor name", async () => {
      await page.locator(".deck-name-input[placeholder*='vendor'], .deck-name-input[placeholder*='Pick']").first().fill("TCGPlayer");
      await page.waitForTimeout(300);
    });
    await shot(page, "17-desktop-order-create-form.png");
    await attempt("close order form", async () => {
      await click(page, "button", { hasText: "Discard" });
      await page.waitForTimeout(300);
    });

    // 18 — Orders received tab
    await attempt("click Received tab", async () => {
      await click(page, ".order-filter-tab", { hasText: "Received" });
      await page.waitForTimeout(400);
    });
    await shot(page, "18-desktop-orders-received.png");

    // 19 — Collection import confirmation (inject a fake CSV to trigger the banner)
    await attempt("nav to Collection for import", () => clickNav(page, "My Collection"));
    await attempt("trigger CSV replace confirmation", async () => {
      const csvContent = "Card Name,Set Code,Collector Number,Quantity,Foil\nLightning Bolt,M11,149,4,No";
      const tmpCsv = path.join(os.tmpdir(), "fetchlist-test-collection.csv");
      fs.writeFileSync(tmpCsv, csvContent);
      await page.locator('input[type="file"][accept=".csv"]').setInputFiles(tmpCsv);
      await page.waitForTimeout(600);
      fs.unlinkSync(tmpCsv);
    });
    await shot(page, "19-desktop-collection-import-confirm.png");
    await attempt("cancel CSV replace", async () => {
      await click(page, ".collection-confirm-actions .btn-ghost", { hasText: "Cancel" });
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
      results.push({ name: "20-desktop-buy-flow-vendor.png", ok: false, error: "buy-list-btn not visible" });
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

    // 25 — Order details expanded
    await attempt("nav to Orders for details", () => clickNav(page, "Orders"));
    await attempt("expand order details", async () => {
      await click(page, "button", { hasText: "Details" });
      await page.waitForTimeout(600);
    });
    await shot(page, "25-desktop-order-details.png");

    // 26 — Order create form with a card added
    await attempt("open new order form for card add", async () => {
      await click(page, "button", { hasText: "New order" });
      await page.waitForTimeout(SETTLE_MS);
    });
    await attempt("search for a card in order form", async () => {
      await page.locator(".combobox-input").fill("Force");
      await page.waitForTimeout(600);
    });
    await shot(page, "26-desktop-order-form-card-search.png");
    await attempt("pick first card result", async () => {
      await page.locator(".combobox-result-btn").first().click({ timeout: 5_000 });
      await page.waitForTimeout(500);
    });
    await shot(page, "26b-desktop-order-form-card-added.png");
    await attempt("close order form", async () => {
      await click(page, "button", { hasText: "Discard" });
      await page.waitForTimeout(300);
    });

    // 28 — Deck rename inline form
    await attempt("nav to Decks for rename", () => clickNav(page, "My Decks"));
    await attempt("select first deck for rename", async () => {
      await page.locator(".deck-list .deck-item").first().click({ timeout: 5_000 });
      await page.waitForTimeout(600);
    });
    await attempt("open rename form", async () => {
      await click(page, "button.rename-btn");
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
    await attempt("capture empty collection state", async () => {
      const emptyBrowser = await chromium.launch({ headless: false });
      const emptyCtx2 = await emptyBrowser.newContext({ viewport: { width: 1440, height: 900 } });
      const emptySeed = Object.fromEntries(
        Object.entries(seedData).filter(([k]) =>
          !k.includes("collection")
        )
      );
      await emptyCtx2.addInitScript((entries: Record<string, string>) => {
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      }, emptySeed);
      const emptyPage2 = await emptyCtx2.newPage();
      await emptyPage2.goto(BASE_URL);
      try { await emptyPage2.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
      await emptyPage2.waitForTimeout(SETTLE_MS);
      await emptyPage2.locator("button.nav-btn", { hasText: "My Collection" }).first().click({ timeout: 5_000 });
      await emptyPage2.waitForTimeout(SETTLE_MS);
      await shot(emptyPage2, "27-desktop-collection-empty.png");
      await emptyPage2.close();
      await emptyBrowser.close();
    });

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
      results.push({ name: "14-mobile-buy-list.png", ok: false, error: "buy-list-btn not visible" });
    }

    // ── TABLET (768×1024) ──────────────────────────────────────────────────
    await page.setViewportSize({ width: 768, height: 1024 });
    console.log("\n── Tablet 768×1024 ──");

    await gotoAndSettle(page, BASE_URL);
    await attempt("nav to Decks (tablet)", () => clickNav(page, "Decks"));
    await shot(page, "15-tablet-decks.png");

    await attempt("nav to Collection (tablet)", () => clickNav(page, "My Collection"));
    await shot(page, "16-tablet-collection.png");

  } finally {
    await page.close();
    if (persistent) {
      await ctx.close();
    } else {
      await ctx.browser()?.close();
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log(`\n${"─".repeat(56)}`);
  console.log(`Capture complete: ${succeeded.length} succeeded, ${failed.length} failed`);
  console.log(`Output: ${OUT_DIR}\n`);

  if (failed.length > 0) {
    console.log("Failed:");
    for (const f of failed) console.log(`  ✗  ${f.name}${f.error ? ": " + f.error : ""}`);
    console.log("");
  }
  console.log("Succeeded:");
  for (const s of succeeded) console.log(`  ✓  ${s.name}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
