export interface PartnerCardInfo {
  name: string;
  keywords: string[];
  oracleText: string;
  typeLine: string;
}

const norm = (s: string) => s.toLowerCase();

function hasKeyword(c: PartnerCardInfo, kw: string): boolean {
  return c.keywords.some(k => norm(k) === kw);
}

/** Name(s) after "Partner with" in the oracle text, ignoring reminder text. */
function partnerWithNames(c: PartnerCardInfo): string[] {
  const names: string[] = [];
  for (const m of c.oracleText.matchAll(/Partner with ([^\n(]+)/gi)) names.push(norm(m[1].trim()));
  return names;
}

function matchesName(full: string, wanted: string[]): boolean {
  const n = norm(full);
  const front = n.split(" // ")[0];
  return wanted.some(w => w === n || w === front);
}

const isBackground = (c: PartnerCardInfo) => /\bBackground\b/.test(c.typeLine);
const isTimeLordDoctor = (c: PartnerCardInfo) => /\bTime Lord\b/.test(c.typeLine) && /\bDoctor\b/.test(c.typeLine);

/** Scryfall lists "Partner" alongside "Partner with", so a plain Partner must not name a specific partner. */
function isPlainPartner(c: PartnerCardInfo): boolean {
  return hasKeyword(c, "partner") && !hasKeyword(c, "partner with") && partnerWithNames(c).length === 0;
}

function oneWay(a: PartnerCardInfo, b: PartnerCardInfo): boolean {
  if (hasKeyword(a, "choose a background") && isBackground(b)) return true;
  if (hasKeyword(a, "doctor's companion") && isTimeLordDoctor(b)) return true;
  return false;
}

/** Whether two commanders look like a legal partner pair (advisory only). */
export function evaluatePartnerPair(a: PartnerCardInfo, b: PartnerCardInfo): boolean {
  if (isPlainPartner(a) && isPlainPartner(b)) return true;
  if (matchesName(b.name, partnerWithNames(a)) && matchesName(a.name, partnerWithNames(b))) return true;
  if (hasKeyword(a, "friends forever") && hasKeyword(b, "friends forever")) return true;
  return oneWay(a, b) || oneWay(b, a);
}

interface ScryfallFace { oracle_text?: string; type_line?: string }
interface ScryfallPartnerCard {
  name: string;
  keywords?: string[];
  oracle_text?: string;
  type_line?: string;
  card_faces?: ScryfallFace[];
}

function toInfo(c: ScryfallPartnerCard): PartnerCardInfo {
  const faces = c.card_faces ?? [];
  return {
    name: c.name,
    keywords: c.keywords ?? [],
    oracleText: c.oracle_text ?? faces.map(f => f.oracle_text ?? "").join("\n"),
    typeLine: c.type_line ?? faces.map(f => f.type_line ?? "").join(" // "),
  };
}

const cache = new Map<string, Promise<boolean | null>>();

/** Clears the per-session pair cache (tests). */
export function clearPartnerCache(): void {
  cache.clear();
}

/**
 * Looks both names up on Scryfall and evaluates the pair.
 * Resolves true/false for legal/not legal, or null when it cannot be determined (fails open).
 */
export function checkPartnerPair(nameA: string, nameB: string): Promise<boolean | null> {
  const key = [nameA, nameB].map(norm).sort().join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async (): Promise<boolean | null> => {
    try {
      const res = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers: [{ name: nameA }, { name: nameB }] }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: ScryfallPartnerCard[]; not_found?: unknown[] };
      if (!body.data || body.data.length !== 2 || (body.not_found?.length ?? 0) > 0) return null;
      return evaluatePartnerPair(toInfo(body.data[0]), toInfo(body.data[1]));
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  // Don't cache failures, so a later retry can succeed.
  void p.then(r => { if (r === null) cache.delete(key); });
  return p;
}
