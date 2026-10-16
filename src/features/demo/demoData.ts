import type { Card, AcquisitionSource, Collection, Deck, Order } from "../../types/index";
import type { Trade, TradeCard } from "../../types/trade";
import { DEFAULT_SETTINGS } from "../../types/trade";
import type { DemoValues } from "./demoMode";

const DAY = 86_400_000;

type State = "owned" | "ordered" | "need";
// name, quantity, colors, type line, state, unit price (USD)
type Row = [string, number, string, string, State, number];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function makeCards(deckKey: string, rows: Row[]): Card[] {
  return rows.map(([name, quantity, colors, type, state, price]) => {
    const source: AcquisitionSource = state === "need" ? "need_to_buy" : state;
    return {
      id: `${deckKey}-${slug(name)}`,
      name,
      quantity,
      acquired: state === "owned",
      color: colors === "" ? [] : colors.split(""),
      type,
      source,
      price,
    };
  });
}

// ── Deck A: nearly done (Built) ───────────────────────────────────────────────
const DECK_A: Row[] = [
  ["Selvala, Heart of the Wilds", 1, "G", "Legendary Creature", "owned", 1.5],
  ["Llanowar Elves", 1, "G", "Creature", "owned", 0.4],
  ["Elvish Mystic", 1, "G", "Creature", "owned", 0.3],
  ["Fyndhorn Elves", 1, "G", "Creature", "owned", 0.5],
  ["Birds of Paradise", 1, "G", "Creature", "owned", 6],
  ["Priest of Titania", 1, "G", "Creature", "owned", 1.2],
  ["Elvish Archdruid", 1, "G", "Creature", "owned", 2],
  ["Craterhoof Behemoth", 1, "G", "Creature", "owned", 24],
  ["Eternal Witness", 1, "G", "Creature", "owned", 2.5],
  ["Reclamation Sage", 1, "G", "Creature", "owned", 1],
  ["Beast Within", 1, "G", "Instant", "owned", 1.5],
  ["Cultivate", 1, "G", "Sorcery", "owned", 0.5],
  ["Kodama's Reach", 1, "G", "Sorcery", "owned", 0.6],
  ["Rampant Growth", 1, "G", "Sorcery", "owned", 0.3],
  ["Swiftfoot Boots", 1, "", "Artifact — Equipment", "owned", 1.5],
  ["Lightning Greaves", 1, "", "Artifact — Equipment", "owned", 18],
  ["Sol Ring", 1, "", "Artifact", "owned", 1.5],
  ["Command Tower", 1, "", "Land", "owned", 0.4],
  ["Sylvan Library", 1, "G", "Enchantment", "ordered", 22],
  ["Heroic Intervention", 1, "G", "Instant", "need", 8],
  ["Forest", 12, "", "Basic Land — Forest", "owned", 0.1],
];

// ── Deck B: mid-build, five colors ────────────────────────────────────────────
const DECK_B: Row[] = [
  ["The Ur-Dragon", 1, "WUBRG", "Legendary Creature — Dragon", "owned", 4],
  ["Sol Ring", 1, "", "Artifact", "ordered", 1.5],
  ["Arcane Signet", 1, "", "Artifact", "ordered", 2],
  ["Chromatic Lantern", 1, "", "Artifact", "owned", 11],
  ["Command Tower", 1, "", "Land", "owned", 0.4],
  ["Exotic Orchard", 1, "", "Land", "owned", 1],
  ["Mana Confluence", 1, "", "Land", "owned", 9],
  ["City of Brass", 1, "", "Land", "owned", 14],
  ["Reflecting Pool", 1, "", "Land", "need", 17],
  ["Cyclonic Rift", 1, "U", "Instant", "ordered", 32],
  ["Rhystic Study", 1, "U", "Enchantment", "ordered", 36],
  ["Counterspell", 1, "U", "Instant", "owned", 2],
  ["Swords to Plowshares", 1, "W", "Instant", "owned", 3],
  ["Path to Exile", 1, "W", "Instant", "owned", 3.5],
  ["Smothering Tithe", 1, "W", "Enchantment", "need", 24],
  ["Vampiric Tutor", 1, "B", "Instant", "need", 30],
  ["Toxic Deluge", 1, "B", "Sorcery", "owned", 9],
  ["Dockside Extortionist", 1, "R", "Creature", "need", 16],
  ["Dragon Tempest", 1, "R", "Enchantment", "need", 4],
  ["Utvara Hellkite", 1, "R", "Creature — Dragon", "owned", 1],
  ["Dragonlord Atarka", 1, "RG", "Legendary Creature — Dragon", "need", 7],
  ["Scion of the Ur-Dragon", 1, "WUBRG", "Legendary Creature — Dragon", "owned", 0.8],
  ["Thunder-Thrash Elder", 1, "R", "Creature", "owned", 0.5],
  ["Cultivate", 1, "G", "Sorcery", "need", 0.5],
];

// ── Deck C: just started ──────────────────────────────────────────────────────
const DECK_C: Row[] = [
  ["Korvold, Fae-Cursed King", 1, "BRG", "Legendary Creature — Dragon Noble", "owned", 6],
  ["Mayhem Devil", 1, "BR", "Creature", "need", 5],
  ["Treasure Cruise", 1, "U", "Sorcery", "ordered", 1],
  ["Village Rites", 1, "B", "Instant", "need", 0.5],
  ["Viscera Seer", 1, "B", "Creature", "need", 1],
  ["Carrion Feeder", 1, "B", "Creature", "need", 0.4],
  ["Blood Artist", 1, "B", "Creature", "need", 2],
  ["Zulaport Cutthroat", 1, "B", "Creature", "need", 1],
  ["Pitiless Plunderer", 1, "B", "Creature", "need", 4],
  ["Ruthless Ripper", 1, "B", "Creature", "need", 3],
  ["Birthing Pod", 1, "G", "Artifact", "need", 20],
  ["Eternal Witness", 1, "G", "Creature", "need", 2.5],
  ["Wood Elves", 1, "G", "Creature", "need", 0.5],
  ["Skullclamp", 1, "", "Artifact — Equipment", "need", 14],
  ["Sakura-Tribe Elder", 1, "G", "Creature", "need", 0.5],
  ["Lightning Bolt", 1, "R", "Instant", "owned", 1.5],
  ["Dockside Extortionist", 1, "R", "Creature", "need", 16],
  ["Goblin Bombardment", 1, "R", "Enchantment", "need", 6],
  ["Dualcaster Mage", 1, "R", "Creature", "need", 0.4],
  ["Lotus Cobra", 1, "G", "Creature", "need", 2],
  ["Command Tower", 1, "", "Land", "need", 0.4],
  ["Arcane Signet", 1, "", "Artifact", "need", 2],
  ["Sol Ring", 1, "", "Artifact", "owned", 1.5],
  ["Overgrown Tomb", 1, "", "Land", "need", 14],
  ["Blood Crypt", 1, "", "Land", "need", 12],
  ["Stomping Ground", 1, "", "Land", "need", 10],
];

function cardId(deck: Deck, name: string): string {
  const card = deck.cards.find((c) => c.name === name);
  if (!card) throw new Error(`demo fixture: "${name}" is not in deck ${deck.name}`);
  return card.id;
}

function tradeCard(
  id: string,
  name: string,
  set: string,
  collectorNumber: string,
  basePrice: number,
  now: number,
  source: TradeCard["source"],
): TradeCard {
  return {
    id,
    name,
    scryfallId: `demo-${id}`,
    set,
    collectorNumber,
    finish: "nonfoil",
    condition: "NM",
    quantity: 1,
    basePrice,
    priceFetchedAt: now,
    source,
  };
}

/** Builds the localStorage values for demo mode. Every date is derived from `now`. */
export function buildDemoData(now: number): DemoValues {
  const decks: Deck[] = [
    { id: "demo-deck-a", name: "Selvala Elves", format: "commander", createdAt: now - 45 * DAY, isBuilt: true, pricesUpdatedAt: now - 3_600_000, cards: makeCards("a", DECK_A) },
    { id: "demo-deck-b", name: "The Ur-Dragon", format: "commander", createdAt: now - 21 * DAY, pricesUpdatedAt: now - 3_600_000, cards: makeCards("b", DECK_B) },
    { id: "demo-deck-c", name: "Korvold Sacrifice", format: "commander", createdAt: now - 3 * DAY, pricesUpdatedAt: now - 3_600_000, cards: makeCards("c", DECK_C) },
  ];
  const [a, b, c] = decks;
  const priceOf = (deck: Deck, name: string) => deck.cards.find((x) => x.name === name)!.price;
  const line = (deck: Deck, name: string) => ({
    deckId: deck.id,
    cardId: cardId(deck, name),
    cardName: name,
    quantity: 1,
    price: priceOf(deck, name),
  });

  const orders: Order[] = [
    {
      id: "demo-order-1", createdAt: now - 4 * DAY, vendor: "Card Kingdom", orderDate: now - 4 * DAY,
      expectedArrival: now + 2 * DAY, trackingNumber: "9400111899223397812045", carrier: "usps", status: "active",
      cards: [line(b, "Sol Ring"), line(b, "Arcane Signet")],
    },
    {
      id: "demo-order-2", createdAt: now - 12 * DAY, vendor: "TCGplayer", orderDate: now - 12 * DAY,
      expectedArrival: now - 3 * DAY, trackingNumber: "1Z999AA10123456784", carrier: "ups", status: "active",
      cards: [line(b, "Cyclonic Rift"), line(b, "Rhystic Study")],
    },
    {
      id: "demo-order-3", createdAt: now - 1 * DAY, vendor: "ManaPool", status: "active",
      cards: [line(a, "Sylvan Library"), line(c, "Treasure Cruise")],
    },
    {
      id: "demo-order-4", createdAt: now - 20 * DAY, vendor: "Card Kingdom", orderDate: now - 20 * DAY,
      expectedArrival: now - 14 * DAY, trackingNumber: "9400111899223754653912", carrier: "usps", status: "received",
      cards: [
        { cardName: "Demonic Tutor", quantity: 1, price: 28 },
        { cardName: "Imperial Seal", quantity: 1, price: 40 },
      ],
    },
    {
      id: "demo-order-5", createdAt: now - 15 * DAY, vendor: "Face to Face", status: "cancelled",
      notes: "Out of stock, reorder from CK instead",
      cards: [{ cardName: "Gaea's Cradle", quantity: 1, price: 85 }],
    },
  ];

  // Everything acquired as "owned" is in the collection, plus received-order cards and a few binder extras.
  const collection: Collection = {};
  const addOwned = (name: string, quantity: number) => {
    const key = name.toLowerCase();
    const existing = collection[key]?.[0];
    if (existing) existing.quantity = Math.max(existing.quantity, quantity);
    else collection[key] = [{ quantity }];
  };
  for (const deck of decks) {
    for (const card of deck.cards) if (card.acquired && card.source === "owned") addOwned(card.name, card.quantity);
  }
  addOwned("Demonic Tutor", 1);
  addOwned("Imperial Seal", 1);
  addOwned("Mana Crypt", 1);
  addOwned("Force of Will", 1);
  addOwned("Mystic Remora", 1);

  const trade: Trade = {
    mine: {
      cards: [
        tradeCard("t-mine-1", "Mana Crypt", "2xm", "270", 160, now, "collection"),
        tradeCard("t-mine-2", "Force of Will", "2x2", "28", 90, now, "collection"),
      ],
      cash: [],
    },
    theirs: {
      cards: [tradeCard("t-theirs-1", "Mystic Remora", "ice", "92", 30, now, "search")],
      cash: [{ id: "t-cash-1", amount: 20 }],
    },
    settings: { ...DEFAULT_SETTINGS },
    readOnly: false,
  };
  const { mine, theirs, settings } = trade;

  return {
    "mtg-checklist-decks": JSON.stringify(decks),
    "mtg-checklist-collection-v2": JSON.stringify(collection),
    "mtg-checklist-collection-meta-v2": JSON.stringify({
      fileName: "sample-collection.csv",
      importedAt: now - 7 * DAY,
      cardCount: Object.keys(collection).length,
    }),
    "mtg-checklist-orders-v1": JSON.stringify(orders),
    "mtg-checklist-vendor-history": JSON.stringify(["Card Kingdom", "TCGplayer", "ManaPool", "Face to Face"]),
    "mtg-checklist-errors": "{}",
    "fetchlist-trade": JSON.stringify({ mine, theirs, settings }),
    "fetchlist:onboarding:dismissed": "true",
  };
}
