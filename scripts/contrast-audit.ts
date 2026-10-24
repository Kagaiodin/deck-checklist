/**
 * Contrast audit for the screenshot script (`--contrast`). Report only: it never fails the run.
 *
 * For every visible text element on the current screen it computes the text colour against the colour
 * actually painted behind it (ancestor backgrounds composited bottom-up, alpha included) and reports any
 * pair under WCAG AA: 4.5:1, or 3:1 for large text (>= 24px, or >= 18.5px bold).
 *
 * Skipped, and counted in `skipped` so the report says how much it could not judge:
 *  - elements covered by something else at their centre (content behind a scrim or an open popover)
 *  - text over a background-image/gradient (no single backdrop colour)
 *  - disabled controls (WCAG exempts them) and fully transparent elements (hover-only buttons at rest)
 *  - checkboxes, radios and other non-text inputs
 *  - anything inside [data-contrast-exempt] (decorative glyphs: separators, chevrons, arrows, empty-state dashes)
 *
 * See DL-CONTRAST-01 in docs/specs/design-rules-ci-spec.md.
 *
 * The page-side code is a string, not a function, so tsx/esbuild can't inject helpers into it that
 * don't exist in the browser.
 */
import type { Page } from "playwright";

export interface ContrastHit {
  screen: string;
  el: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
  required: number;
  size: number;
  weight: number;
  count: number;
}

export interface ContrastResult {
  hits: ContrastHit[];
  checked: number;
  skipped: number;
}

const AUDIT_SRC = `(async () => {
  // Let hover/fade transitions settle: a mid-fade frame reports a blended colour nobody sees at rest.
  const settling = document.getAnimations().filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity);
  await Promise.race([Promise.allSettled(settling.map((a) => a.finished)), new Promise((r) => setTimeout(r, 1500))]);
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  probe.canvas.width = probe.canvas.height = 1;
  // Resolve any CSS colour (rgb, color(srgb ...), color-mix results) to {r,g,b,a} by painting it on
  // black and on white: a = 1 - (white - black) / 255, so low alphas keep their precision.
  const paint = (css, base) => {
    probe.fillStyle = base; probe.fillRect(0, 0, 1, 1);
    probe.fillStyle = css; probe.fillRect(0, 0, 1, 1);
    return probe.getImageData(0, 0, 1, 1).data;
  };
  const cache = new Map();
  const parse = (css) => {
    if (cache.has(css)) return cache.get(css);
    const k = paint(css, "#000"), w = paint(css, "#fff");
    const a = 1 - (w[0] - k[0]) / 255;
    const out = a < 0.004 ? { r: 0, g: 0, b: 0, a: 0 } : { r: k[0] / a, g: k[1] / a, b: k[2] / a, a };
    cache.set(css, out); return out;
  };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, u) => (t * top.a + u * under.a * (1 - top.a)) / a;
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // Backdrop colour behind el: ancestor backgrounds composited bottom-up. null = a gradient/image is involved.
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== "none") { layers.push(null); break; }
      const bg = parse(cs.backgroundColor);
      if (bg.a > 0) { layers.push(bg); if (bg.a >= 0.999) break; }
    }
    if (layers.includes(null)) return null;
    let acc = { r: 255, g: 255, b: 255, a: 1 }; // nothing painted: the browser canvas is white
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const sel = (el) => {
    const cls = [...el.classList].slice(0, 2).map((c) => "." + c).join("");
    const parent = el.parentElement && el.parentElement.classList[0] ? "." + el.parentElement.classList[0] + " > " : "";
    return parent + el.tagName.toLowerCase() + cls;
  };

  const found = new Map();
  let checked = 0, skipped = 0;
  const consider = (el, text, cs, fgCss) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return;
    if (cs.visibility === "hidden" || cs.display === "none" || el.disabled || el.getAttribute("aria-disabled") === "true") return;
    const top = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1));
    if (!top || !(el.contains(top) || top.contains(el))) { skipped++; return; }
    if (el.closest("[data-contrast-exempt]")) return;
    const bg = backdrop(el);
    if (!bg) { skipped++; return; }
    const opacity = opacityOf(el);
    if (opacity < 0.1) return;
    let fg = parse(fgCss);
    fg = { ...fg, a: fg.a * opacity };
    const painted = over(fg, bg);
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.5 && weight >= 700);
    const required = large ? 3 : 4.5;
    checked++;
    const ratioV = ratio(painted, bg);
    if (ratioV >= required) return;
    const key = sel(el) + "|" + hex(painted) + "|" + hex(bg) + "|" + size;
    const prev = found.get(key);
    if (prev) { prev.count++; return; }
    found.set(key, { el: sel(el), text: text.trim().replace(/\\s+/g, " ").slice(0, 40), fg: hex(painted), bg: hex(bg), ratio: Math.round(ratioV * 100) / 100, required, size, weight, count: 1 });
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    consider(el, t.nodeValue, cs, cs.color);
  }
  for (const el of document.querySelectorAll("textarea, input:not([type]), input[type=text], input[type=search], input[type=number], input[type=email], input[type=url], input[type=password]")) {
    const cs = getComputedStyle(el);
    if (el.value) consider(el, el.value, cs, cs.color);
    else if (el.placeholder) consider(el, el.placeholder, cs, getComputedStyle(el, "::placeholder").color);
  }
  return { hits: [...found.values()], checked, skipped };
})()`;

export async function auditContrast(page: Page, screen: string): Promise<ContrastResult> {
  const res = (await page.evaluate(AUDIT_SRC)) as { hits: Omit<ContrastHit, "screen">[]; checked: number; skipped: number };
  return { ...res, hits: res.hits.map((h) => ({ screen, ...h })) };
}
