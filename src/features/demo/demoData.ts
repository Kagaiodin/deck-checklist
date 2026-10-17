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
  ["Elvish Visionary", 1, "G", "Creature", "owned", 0.2],
  ["Wellwisher", 1, "G", "Creature", "owned", 0.2],
  ["Heritage Druid", 1, "G", "Creature", "owned", 0.4],
  ["Nettle Sentinel", 1, "G", "Creature", "owned", 0.3],
  ["Joraga Warcaller", 1, "G", "Creature", "owned", 1.5],
  ["Imperious Perfect", 1, "G", "Creature", "owned", 3],
  ["Elvish Harbinger", 1, "G", "Creature", "owned", 0.8],
  ["Wirewood Channeler", 1, "G", "Creature", "owned", 0.3],
  ["Ezuri, Renegade Leader", 1, "G", "Legendary Creature", "owned", 2],
  ["Lys Alana Huntmaster", 1, "G", "Creature", "owned", 0.3],
  ["Elvish Clancaller", 1, "G", "Creature", "owned", 1],
  ["Dwynen, Gilt-Leaf Daen", 1, "G", "Legendary Creature", "owned", 0.4],
  ["Regal Force", 1, "G", "Creature", "owned", 1],
  ["Woodland Bellower", 1, "G", "Creature", "owned", 0.3],
  ["Sylvan Ranger", 1, "G", "Creature", "owned", 0.2],
  ["Avenger of Zendikar", 1, "G", "Creature", "owned", 6],
  ["Terastodon", 1, "G", "Creature", "owned", 2],
  ["Woodfall Primus", 1, "G", "Creature", "owned", 1],
  ["Worldly Tutor", 1, "G", "Instant", "owned", 15],
  ["Green Sun's Zenith", 1, "G", "Sorcery", "owned", 12],
  ["Natural Order", 1, "G", "Sorcery", "owned", 20],
  ["Survival of the Fittest", 1, "G", "Enchantment", "owned", 35],
  ["Harmonize", 1, "G", "Sorcery", "owned", 0.5],
  ["Rishkar's Expertise", 1, "G", "Sorcery", "owned", 1],
  ["Return of the Wildspeaker", 1, "G", "Instant", "owned", 1],
  ["Overwhelming Stampede", 1, "G", "Sorcery", "owned", 1],
  ["Song of Freyalise", 1, "G", "Enchantment", "owned", 1],
  ["Garruk's Uprising", 1, "G", "Enchantment", "owned", 0.3],
  ["Skyshroud Claim", 1, "G", "Sorcery", "owned", 0.5],
  ["Nature's Lore", 1, "G", "Sorcery", "owned", 0.7],
  ["Three Visits", 1, "G", "Sorcery", "owned", 0.7],
  ["Farseek", 1, "G", "Sorcery", "owned", 0.6],
  ["Explore", 1, "G", "Sorcery", "owned", 0.3],
  ["Sylvan Scrying", 1, "G", "Sorcery", "owned", 0.3],
  ["Fertile Ground", 1, "G", "Enchantment", "owned", 0.3],
  ["Wild Growth", 1, "G", "Enchantment", "owned", 0.2],
  ["Utopia Sprawl", 1, "G", "Enchantment", "owned", 0.8],
  ["Great Oak Guardian", 1, "G", "Creature", "owned", 0.4],
  ["Nature's Claim", 1, "G", "Instant", "owned", 0.2],
  ["Mana Reflection", 1, "G", "Enchantment", "owned", 5],
  ["Mind Stone", 1, "", "Artifact", "owned", 1],
  ["Thran Dynamo", 1, "", "Artifact", "owned", 2],
  ["Gilded Lotus", 1, "", "Artifact", "owned", 4],
  ["Worn Powerstone", 1, "", "Artifact", "owned", 1.5],
  ["Hedron Archive", 1, "", "Artifact", "owned", 0.8],
  ["Reliquary Tower", 1, "", "Land", "owned", 4],
  ["Myriad Landscape", 1, "", "Land", "owned", 0.5],
  ["Yavimaya Hollow", 1, "", "Land", "owned", 1],
  ["Wirewood Lodge", 1, "", "Land", "owned", 0.3],
  ["Path of Ancestry", 1, "", "Land", "owned", 0.3],
  ["Temple of the False God", 1, "", "Land", "owned", 0.5],
  ["Mosswort Bridge", 1, "", "Land", "owned", 0.4],
  ["Forest", 28, "", "Basic Land — Forest", "owned", 0.1],
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
  ["Miirym, Sentinel Wyrm", 1, "URG", "Legendary Creature — Dragon", "need", 4],
  ["Goldspan Dragon", 1, "R", "Creature — Dragon", "need", 15],
  ["Terror of the Peaks", 1, "R", "Creature — Dragon", "need", 18],
  ["Hellkite Tyrant", 1, "R", "Creature — Dragon", "owned", 2],
  ["Shivan Dragon", 1, "R", "Creature — Dragon", "owned", 0.3],
  ["Nicol Bolas, Dragon-God", 1, "UBR", "Legendary Planeswalker — Bolas", "need", 6],
  ["Silumgar, the Drifting Death", 1, "UB", "Legendary Creature — Dragon", "owned", 0.5],
  ["Dragonlord Dromoka", 1, "WG", "Legendary Creature — Dragon", "need", 4],
  ["Dragonlord Ojutai", 1, "WU", "Legendary Creature — Dragon", "owned", 1.5],
  ["Dragonlord Silumgar", 1, "UB", "Legendary Creature — Dragon", "need", 5],
  ["Dragonlord Kolaghan", 1, "BR", "Legendary Creature — Dragon", "owned", 1],
  ["Arcades, the Strategist", 1, "WUG", "Legendary Creature — Elder Dragon", "need", 3],
  ["Tiamat", 1, "WUBRG", "Creature — Dragon God", "owned", 0.5],
  ["Scourge of Valkas", 1, "R", "Creature — Dragon", "owned", 0.4],
  ["Mind Stone", 1, "", "Artifact", "owned", 1],
  ["Fellwar Stone", 1, "", "Artifact", "need", 1.5],
  ["Commander's Sphere", 1, "", "Artifact", "need", 1],
  ["Wayfarer's Bauble", 1, "", "Artifact", "owned", 0.3],
  ["Kodama's Reach", 1, "G", "Sorcery", "need", 0.6],
  ["Farseek", 1, "G", "Sorcery", "need", 0.6],
  ["Beast Within", 1, "G", "Instant", "owned", 1.5],
  ["Brainstorm", 1, "U", "Instant", "owned", 0.5],
  ["Ponder", 1, "U", "Sorcery", "need", 1.5],
  ["Fierce Guardianship", 1, "U", "Instant", "need", 25],
  ["Negate", 1, "U", "Instant", "owned", 0.3],
  ["Swan Song", 1, "U", "Instant", "need", 1],
  ["Lightning Bolt", 1, "R", "Instant", "owned", 1.5],
  ["Chaos Warp", 1, "R", "Instant", "need", 1],
  ["Anguished Unmaking", 1, "WB", "Instant", "need", 3],
  ["Vindicate", 1, "WB", "Sorcery", "need", 4],
  ["Diabolic Tutor", 1, "B", "Sorcery", "need", 0.3],
  ["Wrath of God", 1, "W", "Sorcery", "owned", 3],
  ["Teferi's Protection", 1, "W", "Instant", "need", 15],
  ["Enlightened Tutor", 1, "W", "Instant", "need", 7],
  ["Eternal Witness", 1, "G", "Creature", "need", 2.5],
  ["Heroic Intervention", 1, "G", "Instant", "need", 8],
  ["Animate Dead", 1, "B", "Enchantment", "need", 1.5],
  ["Dark Ritual", 1, "B", "Instant", "need", 1],
  ["Jeska's Will", 1, "R", "Sorcery", "need", 5],
  ["Generous Gift", 1, "W", "Instant", "owned", 1],
  ["Farewell", 1, "W", "Sorcery", "need", 12],
  ["Faithless Looting", 1, "R", "Sorcery", "owned", 0.3],
  ["Talisman of Dominance", 1, "", "Artifact", "owned", 2],
  ["Talisman of Creativity", 1, "", "Artifact", "owned", 2],
  ["Gilded Lotus", 1, "", "Artifact", "need", 4],
  ["Everflowing Chalice", 1, "", "Artifact", "owned", 1.5],
  ["Evolving Wilds", 1, "", "Land", "owned", 0.3],
  ["Terramorphic Expanse", 1, "", "Land", "owned", 0.3],
  ["Path of Ancestry", 1, "", "Land", "owned", 0.3],
  ["Cavern of Souls", 1, "", "Land", "need", 30],
  ["Ancient Ziggurat", 1, "", "Land", "need", 6],
  ["Plains", 5, "", "Basic Land — Plains", "owned", 0.1],
  ["Island", 5, "", "Basic Land — Island", "owned", 0.1],
  ["Swamp", 5, "", "Basic Land — Swamp", "owned", 0.1],
  ["Mountain", 5, "", "Basic Land — Mountain", "owned", 0.1],
  ["Forest", 5, "", "Basic Land — Forest", "owned", 0.1],
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
  ["Grave Pact", 1, "B", "Enchantment", "need", 6],
  ["Dictate of Erebos", 1, "B", "Enchantment", "need", 3],
  ["Butcher of Malakir", 1, "B", "Creature", "need", 1],
  ["Syr Konrad, the Grim", 1, "B", "Creature", "need", 1.5],
  ["Woe Strider", 1, "B", "Creature", "need", 0.8],
  ["Bloodthrone Vampire", 1, "B", "Creature", "need", 0.4],
  ["Priest of Forgotten Gods", 1, "B", "Creature", "need", 5],
  ["Altar of Dementia", 1, "", "Artifact", "need", 3],
  ["Ashnod's Altar", 1, "", "Artifact", "need", 5],
  ["Phyrexian Altar", 1, "", "Artifact", "need", 25],
  ["Mind Stone", 1, "", "Artifact", "need", 1],
  ["Commander's Sphere", 1, "", "Artifact", "need", 1],
  ["Bloodghast", 1, "B", "Creature", "need", 1],
  ["Reassembling Skeleton", 1, "B", "Creature", "need", 1],
  ["Gravecrawler", 1, "B", "Creature", "need", 0.4],
  ["Disciple of the Vault", 1, "R", "Creature", "need", 0.5],
  ["Impact Tremors", 1, "R", "Enchantment", "need", 0.3],
  ["Kuldotha Rebirth", 1, "R", "Sorcery", "need", 0.5],
  ["Siege-Gang Commander", 1, "R", "Creature", "need", 2],
  ["Mogg War Marshal", 1, "R", "Creature", "need", 0.5],
  ["Krenko's Command", 1, "R", "Sorcery", "need", 0.3],
  ["Prosperous Innkeeper", 1, "G", "Creature", "need", 0.3],
  ["Wall of Roots", 1, "G", "Creature", "need", 0.8],
  ["Courser of Kruphix", 1, "G", "Creature", "need", 1.5],
  ["Satyr Wayfinder", 1, "G", "Creature", "need", 0.3],
  ["Harmonize", 1, "G", "Sorcery", "need", 0.5],
  ["Beast Within", 1, "G", "Instant", "need", 1.5],
  ["Nature's Lore", 1, "G", "Sorcery", "need", 0.7],
  ["Kodama's Reach", 1, "G", "Sorcery", "need", 0.6],
  ["Cultivate", 1, "G", "Sorcery", "need", 0.5],
  ["Fellwar Stone", 1, "", "Artifact", "need", 1.5],
  ["Wayfarer's Bauble", 1, "", "Artifact", "need", 0.3],
  ["Chaos Warp", 1, "R", "Instant", "need", 1],
  ["Toxic Deluge", 1, "B", "Sorcery", "need", 9],
  ["Vandalblast", 1, "R", "Sorcery", "need", 0.3],
  ["Damnation", 1, "B", "Sorcery", "need", 15],
  ["Diabolic Tutor", 1, "B", "Sorcery", "need", 0.3],
  ["Entomb", 1, "B", "Instant", "need", 6],
  ["Tragic Slip", 1, "B", "Instant", "need", 0.5],
  ["Fatal Push", 1, "B", "Instant", "need", 1],
  ["Return of the Wildspeaker", 1, "G", "Instant", "need", 1],
  ["Reclamation Sage", 1, "G", "Creature", "need", 1],
  ["Elvish Mystic", 1, "G", "Creature", "need", 0.3],
  ["Evolving Wilds", 1, "", "Land", "need", 0.3],
  ["Terramorphic Expanse", 1, "", "Land", "need", 0.3],
  ["Path of Ancestry", 1, "", "Land", "need", 0.3],
  ["Swamp", 10, "", "Basic Land — Swamp", "owned", 0.1],
  ["Mountain", 9, "", "Basic Land — Mountain", "owned", 0.1],
  ["Forest", 9, "", "Basic Land — Forest", "owned", 0.1],
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
