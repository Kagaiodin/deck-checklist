import type { Collection, OrderCard } from "../types/index";
import { getFrontFaceName } from "./dualface";

// ── Column alias lists ────────────────────────────────────────────────────────
const COUNT_ALIASES     = ["count", "quantity", "qty", "amount", "have"];
const NAME_ALIASES      = ["name", "card name", "card", "title"];
const SET_ALIASES       = ["edition", "set", "set code", "set_code", "expansion", "set name"];
const COLLECTOR_ALIASES = ["collector number", "collector_number", "card number", "number", "#"];
const FOIL_ALIASES      = ["foil", "is foil", "isfol", "foil?"];

// ── CSV row parser (handles quoted fields) ────────────────────────────────────
function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ── Header detection ──────────────────────────────────────────────────────────
function detectColumn(headers: string[], aliases: string[], label: string): number {
  const matches = headers
    .map((h, i) => ({ h: h.toLowerCase().trim(), i }))
    .filter(({ h }) => aliases.includes(h));

  if (matches.length === 0) {
    throw new Error(
      `Could not find a ${label} column in this CSV. ` +
      `Expected one of: ${aliases.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(", ")}. ` +
      `Columns found: ${headers.join(", ")}`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Found more than one possible ${label} column: ${matches.map(m => m.h).join(", ")}. ` +
      `Rename or remove duplicates and re-upload.`
    );
  }
  return matches[0].i;
}

// Returns -1 if column not found (optional columns)
function detectColumnOptional(headers: string[], aliases: string[]): number {
  const matches = headers
    .map((h, i) => ({ h: h.toLowerCase().trim(), i }))
    .filter(({ h }) => aliases.includes(h));
  return matches.length === 1 ? matches[0].i : -1;
}

// ── Main parser ───────────────────────────────────────────────────────────────
export function parseCollectionCSV(raw: string): Collection {
  // Strip UTF-8 BOM and normalise line endings
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter(l => l.trim() !== "");

  if (lines.length < 2) {
    throw new Error("CSV appears to be empty or has no data rows.");
  }

  const headerFields = parseCSVRow(lines[0]);
  const countIdx     = detectColumn(headerFields, COUNT_ALIASES, "quantity");
  const nameIdx      = detectColumn(headerFields, NAME_ALIASES,  "card name");
  const setIdx       = detectColumnOptional(headerFields, SET_ALIASES);
  const collectorIdx = detectColumnOptional(headerFields, COLLECTOR_ALIASES);
  const foilIdx      = detectColumnOptional(headerFields, FOIL_ALIASES);

  const collection: Collection = {};

  for (let i = 1; i < lines.length; i++) {
    const fields    = parseCSVRow(lines[i]);
    const rawName   = (fields[nameIdx]  ?? "").trim();
    const rawCount  = (fields[countIdx] ?? "").trim();

    if (!rawName) continue;

    const qty = parseInt(rawCount, 10);
    if (isNaN(qty) || qty <= 0) continue;

    // Normalise DFC names: "Bala Ged Recovery // Bala Ged Sanctuary" → "Bala Ged Recovery"
    const name = rawName.includes(" // ") ? getFrontFaceName(rawName) : rawName;
    const key  = name.toLowerCase();

    const set             = setIdx       >= 0 ? (fields[setIdx]       ?? "").trim().toUpperCase() || undefined : undefined;
    const collectorNumber = collectorIdx >= 0 ? (fields[collectorIdx] ?? "").trim() || undefined : undefined;
    const foilRaw         = foilIdx      >= 0 ? (fields[foilIdx]      ?? "").trim().toLowerCase() : "";
    const foil            = foilRaw === "true" || foilRaw === "yes" || foilRaw === "1" ? true : undefined;

    // Merge rows with identical printing key (same set + collector + foil)
    const existing = collection[key] ?? [];
    const match = existing.find(
      p => p.set === set && p.collectorNumber === collectorNumber && p.foil === foil
    );
    if (match) {
      match.quantity += qty;
    } else {
      existing.push({ quantity: qty, set, collectorNumber, foil });
    }
    collection[key] = existing;
  }

  return collection;
}

// ── Merge order receipt into collection ──────────────────────────────────────
// Called when an order is marked Received (Option A: quantity-only, no set/CN).
// Finds a generic printing entry (no set/CN/foil) and increments it, or creates one.
export function mergeOrderCardsIntoCollection(
  orderCards: OrderCard[],
  collection: Collection
): Collection {
  const updated: Collection = { ...collection };
  for (const { cardName, quantity } of orderCards) {
    const key = cardName.toLowerCase();
    const existing = Array.isArray(updated[key]) ? [...updated[key]] : [];
    const genericIdx = existing.findIndex(p => !p.set && !p.collectorNumber && !p.foil);
    if (genericIdx >= 0) {
      existing[genericIdx] = { ...existing[genericIdx], quantity: existing[genericIdx].quantity + quantity };
    } else {
      existing.push({ quantity });
    }
    updated[key] = existing;
  }
  return updated;
}

// ── Apply collection to a list of cards ──────────────────────────────────────
// Used both on deck import and in the APPLY_COLLECTION reducer action.
// Cards with manuallyTagged = true are skipped.
export function applyCollectionToCards<T extends {
  name: string;
  quantity: number;
  source?: string;
  manuallyTagged?: boolean;
}>(cards: T[], collection: Collection): T[] {
  return cards.map(card => {
    if (card.manuallyTagged) return card;

    const printings = collection[card.name.toLowerCase()] ?? [];
    const qty = printings.reduce((sum, p) => sum + p.quantity, 0);

    if (qty >= card.quantity && card.source !== "owned") {
      return { ...card, source: "owned" as const };
    }
    if (qty < card.quantity && card.source === "owned") {
      return { ...card, source: undefined };
    }
    return card;
  });
}
