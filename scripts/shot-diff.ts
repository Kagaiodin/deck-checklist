/**
 * Before/after check for two screenshot folders from capture-screenshots.ts.
 *
 *   npx tsx scripts/shot-diff.ts <before-dir> <after-dir> [--out <dir>] [--min-pixels 20] [--tile-width 800] [--per-sheet 4]
 *
 * Prints one line per shot that differs (identical shots are not listed), so a clean run is a single line.
 * For the shots that differ it also writes, into --out (default <after-dir>/review):
 *   - <name>.png  before | after, cropped to the changed region (the whole shot if the change is large)
 *   - sheet-N.png those pairs stacked and labelled, --per-sheet to a sheet: the one thing to hand to a reviewer
 *   - manifest.json  the same list as data (shot, changed pixels, %, bounding box)
 * Review the sheets, not the full shots. Shots missing from either side, or with a different size, are reported and
 * listed in the manifest but not drawn.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const argv = process.argv.slice(2);
const flagValue = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const [beforeDir, afterDir] = positional.map((p) => path.resolve(p));
if (!beforeDir || !afterDir) {
  console.error("usage: shot-diff.ts <before-dir> <after-dir> [--out <dir>] [--min-pixels 20] [--tile-width 800] [--per-sheet 4]");
  process.exit(2);
}
const outDir = path.resolve(flagValue("--out") ?? path.join(afterDir, "review"));
const MIN_PIXELS = Number(flagValue("--min-pixels") ?? 20);
const TILE_W = Number(flagValue("--tile-width") ?? 800);
const PER_SHEET = Number(flagValue("--per-sheet") ?? 4);
const CHANNEL_DELTA = 2; // per-channel difference ignored as rendering noise
const PAD = 24;
const GAP = 8;
const LABEL_H = 22;

interface Changed {
  shot: string;
  pixels: number;
  percent: number;
  box: { left: number; top: number; width: number; height: number };
}

const pngs = (dir: string): string[] => fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const raw = (file: string) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

async function compare(shot: string): Promise<Changed | "size" | null> {
  const [a, b] = await Promise.all([raw(path.join(beforeDir, shot)), raw(path.join(afterDir, shot))]);
  const { width, height } = a.info;
  if (width !== b.info.width || height !== b.info.height) return "size";
  let pixels = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > CHANNEL_DELTA ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > CHANNEL_DELTA ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > CHANNEL_DELTA
    ) {
      pixels++;
      const p = i / 4, x = p % width, y = (p - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (pixels < MIN_PIXELS) return null;
  const left = Math.max(0, minX - PAD), top = Math.max(0, minY - PAD);
  const box = { left, top, width: Math.min(width, maxX + PAD + 1) - left, height: Math.min(height, maxY + PAD + 1) - top };
  return { shot, pixels, percent: (pixels / (width * height)) * 100, box };
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const labelBar = (width: number, text: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#222"/>` +
      `<text x="8" y="15" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#fff">${esc(text)}</text></svg>`,
  );

/** before | after for one shot, cropped to the changed region unless the change covers most of it. */
async function pair(c: Changed): Promise<Buffer> {
  const meta = await sharp(path.join(afterDir, c.shot)).metadata();
  const whole = c.box.width * c.box.height > 0.6 * (meta.width ?? 1) * (meta.height ?? 1);
  const region = whole ? { left: 0, top: 0, width: meta.width!, height: meta.height! } : c.box;
  const panelW = Math.floor((TILE_W - GAP) / 2);
  const panel = async (dir: string) =>
    sharp(path.join(dir, c.shot)).extract(region).resize({ width: panelW, withoutEnlargement: false }).png().toBuffer();
  const [pa, pb] = await Promise.all([panel(beforeDir), panel(afterDir)]);
  const h = (await sharp(pa).metadata()).height!;
  const tile = await sharp({ create: { width: TILE_W, height: LABEL_H + h, channels: 4, background: "#777" } })
    .composite([
      { input: labelBar(TILE_W, `${c.shot}   ${c.percent.toFixed(2)}% changed   (before | after)${whole ? "" : "   cropped"}`), left: 0, top: 0 },
      { input: pa, left: 0, top: LABEL_H },
      { input: pb, left: panelW + GAP, top: LABEL_H },
    ])
    .png()
    .toBuffer();
  return tile;
}

async function main(): Promise<void> {
  const beforeFiles = pngs(beforeDir);
  const afterFiles = new Set(pngs(afterDir));
  const changed: Changed[] = [];
  const problems: string[] = [];
  for (const shot of beforeFiles) {
    if (!afterFiles.has(shot)) { problems.push(`MISSING in after: ${shot}`); continue; }
    const r = await compare(shot);
    if (r === "size") problems.push(`SIZE differs: ${shot}`);
    else if (r) changed.push(r);
  }
  for (const shot of afterFiles) if (!beforeFiles.includes(shot)) problems.push(`NEW in after: ${shot}`);

  const sorted = changed.sort((x, y) => y.percent - x.percent);
  for (const c of sorted) console.log(`${c.percent.toFixed(2).padStart(6)}%  ${String(c.pixels).padStart(8)} px  ${c.shot}`);
  for (const p of problems) console.log(`  ! ${p}`);
  console.log(`${sorted.length}/${beforeFiles.length} shots differ${problems.length ? `, ${problems.length} unmatched` : ""}`);
  if (!sorted.length) return;

  fs.mkdirSync(outDir, { recursive: true });
  const tiles: Buffer[] = [];
  for (const c of sorted) {
    const t = await pair(c);
    fs.writeFileSync(path.join(outDir, c.shot), t);
    tiles.push(t);
  }
  const sheets: string[] = [];
  for (let s = 0; s * PER_SHEET < tiles.length; s++) {
    const group = tiles.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
    const heights = await Promise.all(group.map(async (t) => (await sharp(t).metadata()).height!));
    let y = 0;
    const layers = group.map((input, i) => {
      const layer = { input, left: 0, top: y };
      y += heights[i] + GAP;
      return layer;
    });
    const name = `sheet-${s + 1}.png`;
    await sharp({ create: { width: TILE_W, height: y, channels: 4, background: "#777" } }).composite(layers).png().toFile(path.join(outDir, name));
    sheets.push(name);
  }
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify({ beforeDir, afterDir, changed: sorted, problems, sheets }, null, 2));
  console.log(`Review: ${outDir}  (${sheets.join(", ")})`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
