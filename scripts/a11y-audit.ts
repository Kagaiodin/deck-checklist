/**
 * axe-core audit for the screenshot script (`--a11y` / `--a11y-gate`). See docs/specs/a11y-gate-spec.md.
 *
 * WCAG 2.0/2.1/2.2 A and AA rules (so `target-size` runs). `color-contrast` is off: `test:contrast` does it
 * more accurately. Each violating node reports its first axe selector plus any `data-a11y-allow` marker on the
 * node or an ancestor; the policy (scripts/a11y-policy.ts) decides what fails.
 * Also a custom `dialog-semantics` check: aria-modal needs a dialog role, and every dialog needs an accessible name.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import type { Page } from "playwright";
import type { A11yHit } from "./a11y-policy";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const AXE_SOURCE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

interface RawNode { selector: string; allow?: string }
interface RawViolation { rule: string; impact: string | null; help: string; nodes: RawNode[] }

export async function auditA11y(page: Page, screen: string): Promise<A11yHit[]> {
  if (!(await page.evaluate("typeof window.axe !== 'undefined'"))) await page.evaluate(AXE_SOURCE);
  const raw = (await page.evaluate(`(async () => {
    const res = await window.axe.run(document, {
      runOnly: { type: "tag", values: ${JSON.stringify(TAGS)} },
      rules: { "color-contrast": { enabled: false } },
      resultTypes: ["violations"],
    });
    return res.violations.map((v) => ({
      rule: v.id, impact: v.impact, help: v.help,
      nodes: v.nodes.map((n) => {
        const selector = String(Array.isArray(n.target[0]) ? n.target[0].join(" ") : n.target[0]);
        let el = null;
        try { el = document.querySelector(selector); } catch {}
        const holder = el && el.closest("[data-a11y-allow]");
        return { selector, allow: holder ? holder.getAttribute("data-a11y-allow") : undefined };
      }),
    }));
  })()`)) as RawViolation[];

  const dialogs = (await page.evaluate(`(() => {
    const name = (el) => {
      const label = el.getAttribute("aria-label");
      if (label && label.trim()) return true;
      const ids = (el.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
      return ids.some((id) => { const t = document.getElementById(id); return t && t.textContent.trim(); });
    };
    const out = [];
    for (const el of document.querySelectorAll('[aria-modal="true"], [role="dialog"], [role="alertdialog"]')) {
      const role = el.getAttribute("role");
      const isDialog = role === "dialog" || role === "alertdialog";
      const cls = (el.className && String(el.className).split(/\\s+/)[0]) || el.tagName.toLowerCase();
      const selector = "." + cls;
      if (el.getAttribute("aria-modal") === "true" && !isDialog) out.push({ selector, help: "aria-modal element must have role dialog or alertdialog" });
      if (isDialog && !name(el)) out.push({ selector, help: "dialog needs an accessible name (aria-label or aria-labelledby)" });
    }
    return out;
  })()`)) as { selector: string; help: string }[];

  const dialogHits: A11yHit[] = dialogs.map(d => ({ rule: "dialog-semantics", screen, selector: d.selector, impact: "serious", help: d.help }));
  return [...dialogHits, ...raw.flatMap(v => v.nodes.map(n => ({ rule: v.rule, screen, selector: n.selector, impact: v.impact, help: v.help, allow: n.allow })))];
}
