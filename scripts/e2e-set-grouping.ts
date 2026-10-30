/**
 * Real-browser check for Collection "Group by set" (#45).
 *
 * jsdom tests mock react-virtuoso, so they cannot see GroupedVirtuoso failing to pick up its groups when it mounts
 * as the result of a sort change (headers were missing until the component was keyed). This drives the real UI at
 * 375px: switch the sort, then assert headers render, collapse works, and search forces groups open.
 *
 *   sh scripts/e2e-set-grouping.sh          # starts the dev server if :5173 is not already up
 *   npx tsx scripts/e2e-set-grouping.ts     # against a server you already started
 */

import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const HEADLESS = !process.argv.includes("--headed");

const collection = {
  "sol ring": [
    { quantity: 1, set: "cmm", collectorNumber: "1" },
    { quantity: 1, set: "lea", collectorNumber: "270" },
  ],
  "counterspell": [{ quantity: 2, set: "cmm", collectorNumber: "3" }],
  "island": [{ quantity: 3 }],
};
const meta = { fileName: "e2e.csv", importedAt: Date.now(), cardCount: Object.keys(collection).length };

const browser = await chromium.launch({ headless: HEADLESS });
try {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await ctx.addInitScript(([c, m]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("mtg-checklist-collection-v2", c);
    localStorage.setItem("mtg-checklist-collection-meta-v2", m);
    localStorage.setItem("fetchlist:onboarding:dismissed", "true");
  }, [JSON.stringify(collection), JSON.stringify(meta)]);

  const page = await ctx.newPage();
  await page.goto(BASE_URL);
  await page.locator("button.nav-btn", { hasText: "Collection" }).first().click();

  // Switching sort mounts GroupedVirtuoso after the page is already showing the flat list.
  await page.locator(".collection-sort-btn--icon:visible").click();
  await page.locator(".sort-option:visible", { hasText: "Group by set" }).click();

  const headers = page.locator(".collection-set-header");
  await headers.first().waitFor({ timeout: 5_000 });
  const codes = await headers.locator(".collection-set-code").allTextContents();
  assert.deepEqual(codes, ["CMM", "LEA", "Unknown set"], "headers render in set order, Unknown last");
  assert.match((await headers.first().innerText()).replace(/\s+/g, " "), /2 cards \(3 copies\)/);

  const cmm = headers.first();
  const rowCount = () => page.locator(".collection-row").count();
  assert.equal(await rowCount(), 4);

  await cmm.click();
  assert.equal(await cmm.getAttribute("aria-expanded"), "false");
  assert.equal(await rowCount(), 2, "collapsing CMM hides its rows");

  await page.getByRole("button", { name: "Expand all" }).isHidden(); // not all collapsed yet
  await page.getByRole("button", { name: "Collapse all" }).click();
  assert.equal(await page.locator('.collection-set-header[aria-expanded="false"]').count(), 3);
  await page.getByRole("button", { name: "Expand all" }).click();
  assert.equal(await rowCount(), 4);

  await cmm.click();
  await page.locator(".collection-mobile-search-input").fill("counter");
  assert.equal(await cmm.getAttribute("aria-expanded"), "true", "search forces groups open");
  assert.equal(await rowCount(), 1);

  console.log("e2e set grouping: ok");
} finally {
  await browser.close();
}
